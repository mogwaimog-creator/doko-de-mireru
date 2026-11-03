'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const redisPath=require.resolve('../api/_redis');
const ledgerPath=require.resolve('../api/_work-ledger');
const cachePath=require.resolve('../api/_detail-providers-cache');
const original=new Map([redisPath,ledgerPath,cachePath].map(p=>[p,require.cache[p]]));
const values=new Map();
let failRead=false,failLock=false,failWrite=false;
require.cache[redisPath]={id:redisPath,filename:redisPath,loaded:true,exports:{command:async args=>{
 const [cmd,key,value]=args;
 if(cmd==='GET'){if(failRead)throw Error('Redis read outage');return values.get(key)||null;}
 if(cmd==='SET'){
  if(failLock && key.endsWith(':refresh-lock'))throw Error('Redis lock outage');
  if(failWrite && !args.includes('NX'))throw Error('Redis write outage');
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
test.beforeEach(()=>{values.clear();failRead=false;failLock=false;failWrite=false;});
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

test('malformed upstream response cannot overwrite previously saved availability',async()=>{
 const now=Date.now(),key='doko:detail-providers:v1:movie:99';
 const old={results:{JP:{flatrate:[{provider_id:8}]}}};
 values.set(key,JSON.stringify({data:old,checkedAt:new Date(now-DAY-1000).toISOString()}));
 const result=await getDetailProviders('movie',99,async()=>({status_message:'TMDB error'}),now);
 assert.equal(result.stale,true);
 assert.deepEqual(result.data,old);
 const saved=JSON.parse(values.get(key));
 assert.deepEqual(saved.data,old);
});
test('valid empty provider results are still cacheable',async()=>{
 const result=await getDetailProviders('movie',100,async()=>({results:{}}));
 assert.equal(result.stale,false);
 assert.deepEqual(result.data.results,{});
});

test('Redis read outage does not trigger TMDB provider fetch',async()=>{
 failRead=true;let loads=0;
 await assert.rejects(getDetailProviders('movie',901,async()=>{loads++;return {results:{}};}),e=>e.code==='DETAIL_STORAGE_UNAVAILABLE');
 assert.equal(loads,0);
});
test('Redis lock outage does not trigger TMDB provider fetch',async()=>{
 failLock=true;let loads=0;
 await assert.rejects(getDetailProviders('movie',902,async()=>{loads++;return {results:{}};}),e=>e.code==='DETAIL_STORAGE_UNAVAILABLE');
 assert.equal(loads,0);
});
test('Redis write outage never reports uncached data as safely cached',async()=>{
 failWrite=true;
 await assert.rejects(getDetailProviders('movie',903,async()=>({results:{}})),e=>e.code==='DETAIL_STORAGE_UNAVAILABLE');
});
test('Redis lock outage returns stale saved provider data without TMDB fetch',async()=>{
 const now=Date.now();
 const old={results:{JP:{flatrate:[{provider_id:8}]}}};
 values.set('doko:detail-providers:v1:movie:904',JSON.stringify({data:old,checkedAt:new Date(now-DAY-1000).toISOString()}));
 failLock=true;let loads=0;
 const result=await getDetailProviders('movie',904,async()=>{loads++;return {results:{}};},now);
 assert.equal(result.stale,true);assert.deepEqual(result.data,old);assert.equal(loads,0);
});

test('corrupt saved provider payload is not served as a valid cache hit',async()=>{
 const now=Date.now(),key='doko:detail-providers:v1:movie:906';
 values.set(key,JSON.stringify({data:{status_message:'upstream error'},checkedAt:new Date(now).toISOString()}));
 let loads=0;
 const result=await getDetailProviders('movie',906,async()=>{loads++;return {results:{JP:{}}};},now);
 assert.equal(loads,1);
 assert.deepEqual(result.data,{results:{JP:{}}});
 assert.deepEqual(JSON.parse(values.get(key)).data,result.data);
});
