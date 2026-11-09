'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const cache=require.cache,redisPath=require.resolve('../api/_redis'),readerPath=require.resolve('../api/_shared-streaming-read'),handlerPath=require.resolve('../api/series-watch'),workPath=require.resolve('../api/_series-work-read');
const actualReader=require(readerPath);
async function run({enabled=false,newRecords={},readFails=false,env='development',recovery=false}={}){
 const oldWork=cache[workPath],oldRedis=cache[redisPath],oldReader=cache[readerPath],oldHandler=cache[handlerPath],oldEnv={...process.env};let calls=[];
 try{
  process.env.SHARED_STREAMING_READ_ENABLED=enabled?'1':'0';process.env.VERCEL_ENV=env;
  cache[redisPath]={exports:{command:async args=>{calls.push(args);assert.equal(args[0],'MGET');return args.slice(1).map(()=>JSON.stringify({flatrate:[],checkedAt:new Date(Date.now()-60000).toISOString()}))}}};
  cache[readerPath]={exports:{recoveryOnly:()=>recovery&&actualReader.enabled(),enabled:actualReader.enabled,selectWatch:actualReader.selectWatch,readMany:async()=>{if(readFails)throw Error('local unavailable');return newRecords}}};
  cache[workPath]={exports:{readMany:async()=>{throw Error('existing series must never read fixed work metadata')}}};delete cache[handlerPath];const handler=require(handlerPath);
  const response={setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};
  await handler({method:'GET',query:{series:'kimetsu'}},response);return {response,calls};
 }finally{process.env=oldEnv;for(const [p,v] of [[workPath,oldWork],[redisPath,oldRedis],[readerPath,oldReader],[handlerPath,oldHandler]])if(v)cache[p]=v;else delete cache[p]}
}
test('flag off retains exact legacy read contract, empty is confirmed and no TMDB',async()=>{
 const {response,calls}=await run();assert.equal(response.code,200);assert.equal(response.body.complete,true);assert.equal(calls.length,1);assert(calls[0].slice(1).every(k=>k.startsWith('doko:watch:v3:')));assert.deepEqual(response.body.providers['movie:635302'].flatrate,[]);
});
test('flag on uses shared cache for same work across series; missing data falls back',async()=>{
 const watch={flatrate:[{provider_id:8}],checkedAt:new Date().toISOString(),stale:false};
 const {response}=await run({enabled:true,newRecords:{'movie:635302':{watch}}});assert.deepEqual(response.body.providers['movie:635302'],watch);assert.deepEqual(response.body.providers['tv:85937'].flatrate,[]);
});
test('shared Redis outage rolls back to saved legacy records',async()=>{
 const {response}=await run({enabled:true,readFails:true});assert.equal(response.code,200);assert.equal(response.body.complete,true);
});
test('production environment ignores the development flag',async()=>{
 const {response}=await run({enabled:true,env:'production',newRecords:{'movie:635302':{watch:{flatrate:[{provider_id:999}]}}}});assert.deepEqual(response.body.providers['movie:635302'].flatrate,[]);
});

test('stale shared availability cannot hide a newer successful empty legacy result',async()=>{
 const watch={flatrate:[{provider_id:8}],checkedAt:new Date(Date.now()-2*86400000).toISOString(),stale:true};
 const {response}=await run({enabled:true,newRecords:{'movie:635302':{watch}}});
 assert.deepEqual(response.body.providers['movie:635302'].flatrate,[]);assert.equal(response.body.providers['movie:635302'].stale,false);
});

test('recovery mode uses new records only with no legacy Redis read, and fails closed on outage',async()=>{
 const watch={flatrate:[],checkedAt:new Date().toISOString(),stale:false};const {response,calls}=await run({enabled:true,recovery:true,newRecords:{'movie:635302':{watch}}});assert.equal(response.code,200);assert.equal(calls.length,0);assert.equal(response.body.complete,false);assert.deepEqual(response.body.providers['movie:635302'].flatrate,[]);assert.equal((await run({enabled:true,recovery:true,readFails:true})).response.code,503);
});
