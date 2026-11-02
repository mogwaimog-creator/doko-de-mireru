'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const redisPath=require.resolve('../api/_redis');
const ledgerPath=require.resolve('../api/_work-ledger');
const firstPath=require.resolve('../api/_work-first-load');
const metadataPath=require.resolve('../api/_detail-metadata-cache');
const original=new Map([redisPath,ledgerPath,firstPath,metadataPath].map(p=>[p,require.cache[p]]));
const values=new Map();
const calls=[];
let failLock=false,failWaitRead=false;
require.cache[redisPath]={id:redisPath,filename:redisPath,loaded:true,exports:{command:async args=>{
 calls.push(args);
 const [cmd,key,value,a,b]=args;
 if(cmd==='GET'){
  if(failWaitRead)throw Error('Simulated Redis read outage');
  return values.get(key)??null;
 }
 if(cmd==='SET'){
  if(failLock && key.endsWith(':initial-load-lock'))throw Error('Simulated Redis lock outage');
  const nx=args.includes('NX');
  if(nx&&values.has(key))return null;
  values.set(key,value);return 'OK';
 }
 if(cmd==='EVAL'){
  const lockKey=args[3],token=args[4];
  if(values.get(lockKey)===token){values.delete(lockKey);return 1;}
  return 0;
 }
 throw Error('Unexpected Redis command: '+cmd);
}}};
for(const p of [ledgerPath,firstPath,metadataPath])delete require.cache[p];
const {metadataWithLedger}=require('../api/_detail-metadata-cache');
test.after(()=>{for(const [p,entry] of original){if(entry)require.cache[p]=entry;else delete require.cache[p];}});
test.beforeEach(()=>{values.clear();calls.length=0;failLock=false;failWaitRead=false;process.env.WORK_LEDGER_ENABLED='1';});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test('two simultaneous requests share one first TMDB metadata fetch',async()=>{
 let loads=0;
 const fetchDetail=async()=>{loads++;await sleep(180);return {id:101,title:'映画A',release_date:'2000-01-01'};};
 const [a,b]=await Promise.all([
  metadataWithLedger('movie',101,fetchDetail),
  metadataWithLedger('movie',101,fetchDetail)
 ]);
 assert.equal(loads,1);
 assert.equal(a.id,101);
 assert.equal(b.id,101);
 assert.equal(b.title,'映画A');
 assert.equal(calls.filter(args=>args[0]==='SET'&&args[1]==='doko:work:v1:movie:101').length,1);
});
test('failed first fetch releases lock so later visitor can retry',async()=>{
 await assert.rejects(metadataWithLedger('movie',202,async()=>{throw Error('TMDB unavailable');}),/TMDB unavailable/);
 const result=await metadataWithLedger('movie',202,async()=>({id:202,title:'再試行作品'}));
 assert.equal(result.id,202);
 assert.equal(values.has('doko:work:v1:movie:202:initial-load-lock'),false);
});
test('cached work avoids further metadata fetches',async()=>{
 let loads=0;
 const load=async()=>{loads++;return {id:303,title:'保存作品'};};
 await metadataWithLedger('movie',303,load);
 await metadataWithLedger('movie',303,load);
 assert.equal(loads,1);
});

test('waiter times out with retryable busy error without duplicate TMDB fetch',async()=>{
 const lockKey='doko:work:v1:movie:404:initial-load-lock';
 values.set(lockKey,'another-worker');
 let fallback=0;
 const started=Date.now();
 await assert.rejects(metadataWithLedger('movie',404,async()=>{fallback++;return {id:404,title:'時間切れ作品'};}),error=>error.code==='WORK_METADATA_BUSY');
 const elapsed=Date.now()-started;
 assert.equal(fallback,0);
 assert.ok(elapsed>=2400);
 assert.ok(elapsed<6000);
 assert.equal(values.get(lockKey),'another-worker');
});
test('waiting request rejects a cached record with mismatched TMDB ID',async()=>{
 const key='doko:work:v1:movie:414';
 values.set(key+':initial-load-lock','another-worker');
 values.set(key,JSON.stringify({schemaVersion:1,type:'movie',id:414,title:'保存された作品',extensions:{tmdbDetail:{id:999,title:'別作品'}}}));
 let loads=0;
 await assert.rejects(metadataWithLedger('movie',414,async()=>{loads++;return {id:414,title:'正しい作品'};}),error=>error.code==='WORK_METADATA_BUSY');
 assert.equal(loads,0);
});
test('movie and tv with same TMDB number have independent locks',async()=>{
 let movieLoads=0,tvLoads=0;
 const [movie,tv]=await Promise.all([
  metadataWithLedger('movie',505,async()=>{movieLoads++;return {id:505,title:'映画'};}),
  metadataWithLedger('tv',505,async()=>{tvLoads++;return {id:505,name:'ドラマ'};})
 ]);
 assert.equal(movieLoads,1);
 assert.equal(tvLoads,1);
 assert.equal(movie.id,505);
 assert.equal(tv.id,505);
 assert.ok(values.has('doko:work:v1:movie:505'));
 assert.ok(values.has('doko:work:v1:tv:505'));
});

test('Redis lock failure falls back to direct metadata fetch',async()=>{
 failLock=true;
 const result=await metadataWithLedger('movie',606,async()=>({id:606,title:'取得可能'}));
 assert.equal(result.id,606);
});
test('Redis read failure while waiting falls back without infinite wait',async()=>{
 values.set('doko:work:v1:movie:707:initial-load-lock','another-worker');
 failWaitRead=true;
 const result=await metadataWithLedger('movie',707,async()=>({id:707,title:'読み取り障害'}));
 assert.equal(result.id,707);
});

test('release never deletes a lock owned by a different worker',async()=>{
 const lockKey='doko:work:v1:movie:808:initial-load-lock';
 const result=await metadataWithLedger('movie',808,async()=>{
  values.set(lockKey,'replacement-owner');
  return {id:808,title:'所有権確認'};
 });
 assert.equal(result.id,808);
 assert.equal(values.get(lockKey),'replacement-owner');
});
test('feature flag off does not touch Redis locking or work ledger',async()=>{
 process.env.WORK_LEDGER_ENABLED='0';
 let loads=0;
 const result=await metadataWithLedger('movie',909,async()=>{loads++;return {id:909,title:'従来動作'};});
 assert.equal(result.id,909);
 assert.equal(loads,1);
 assert.equal(calls.length,0);
});
