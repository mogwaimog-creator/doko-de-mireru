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
require.cache[redisPath]={id:redisPath,filename:redisPath,loaded:true,exports:{command:async args=>{
 calls.push(args);
 const [cmd,key,value,a,b]=args;
 if(cmd==='GET')return values.get(key)??null;
 if(cmd==='SET'){
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
test.beforeEach(()=>{values.clear();calls.length=0;process.env.WORK_LEDGER_ENABLED='1';});
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
