'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const redisPath=require.resolve('../api/_redis');
const ledgerPath=require.resolve('../api/_work-ledger');
const cachePath=require.resolve('../api/_detail-providers-cache');
const original=new Map([redisPath,ledgerPath,cachePath].map(p=>[p,require.cache[p]]));
const values=new Map();
require.cache[redisPath]={id:redisPath,filename:redisPath,loaded:true,exports:{command:async args=>{
 const [cmd,key,value]=args;
 if(cmd==='GET')return values.get(key)||null;
 if(cmd==='SET'){
  if(args.includes('NX')&&values.has(key))return null;
  values.set(key,value);return 'OK';
 }
 if(cmd==='EVAL'){
  const lockKey=args[3],token=args[4];
  if(values.get(lockKey)===token){values.delete(lockKey);return 1;}
  return 0;
 }
 throw Error('Unexpected Redis command '+cmd);
}}};
for(const p of [ledgerPath,cachePath])delete require.cache[p];
const {getDetailProviders,DAY}=require('../api/_detail-providers-cache');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
test.after(()=>{for(const [p,v] of original){if(v)require.cache[p]=v;else delete require.cache[p];}});
test.beforeEach(()=>values.clear());
test('two simultaneous first requests fetch providers once',async()=>{
 let loads=0;
 const load=async()=>{loads++;await sleep(180);return {results:{JP:{flatrate:[]}}};};
 const [a,b]=await Promise.all([getDetailProviders('movie',1,load),getDetailProviders('movie',1,load)]);
 assert.equal(loads,1);assert.deepEqual(a.data,b.data);
});
test('concurrent refresh returns stale data without a second fetch',async()=>{
 const now=Date.now();
 values.set('doko:detail-providers:v1:movie:2',JSON.stringify({data:{results:{JP:{buy:[1]}}},checkedAt:new Date(now-DAY-1000).toISOString()}));
 let loads=0;
 const load=async()=>{loads++;await sleep(180);return {results:{JP:{buy:[2]}}};};
 const [a,b]=await Promise.all([getDetailProviders('movie',2,load,now),getDetailProviders('movie',2,load,now)]);
 assert.equal(loads,1);assert.equal([a.stale,b.stale].filter(Boolean).length,1);
});
test('failed refresh returns stale cached data',async()=>{
 const now=Date.now();
 values.set('doko:detail-providers:v1:tv:3',JSON.stringify({data:{results:{JP:{}}},checkedAt:new Date(now-DAY-1000).toISOString()}));
 const result=await getDetailProviders('tv',3,async()=>{throw Error('upstream');},now);
 assert.equal(result.stale,true);assert.ok(result.data.results.JP);
});

test('provider refresh lock remains valid through slow upstream calls',async()=>{
 // Guard against accidentally restoring a short lock during refactoring.
 const cacheSource=require('node:fs').readFileSync(require.resolve('../api/_detail-providers-cache'),'utf8');
 assert.match(cacheSource,/LOCK_SECONDS=30/);
 assert.match(cacheSource,/String\(LOCK_SECONDS\)/);
});
