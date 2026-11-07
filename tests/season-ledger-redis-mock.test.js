'use strict';
const assert=require('node:assert/strict');
const {createSeasonRedisAdapter}=require('../api/_season-ledger-redis');
const {getCachedSeason}=require('../api/_season-ledger-cache');
const storage=new Map();
let sets=0;
const command=async args=>{
 const [op,k,payload,mode]=args;
 if(op==='GET')return storage.get(k)||null;
 if(op==='SET'){
  assert.equal(mode,'NX','SET must always be NX');
  sets++;
  if(storage.has(k))return null;
  storage.set(k,payload);
  return 'OK';
 }
 throw Error('Unexpected command '+op);
};
const adapter=createSeasonRedisAdapter(command);
const record={type:'tv',id:123,seasonNumber:1,seasonName:'第1期',episodes:[]};
(async()=>{
 assert.equal(await adapter.putRecordIfAbsent(record),true);
 assert.equal(await adapter.putRecordIfAbsent({...record,seasonName:'上書き禁止'}),false);
 assert.equal((await adapter.getRecord('tv',123,1)).seasonName,'第1期');
 assert.equal(storage.size,1);
 let fetches=0;
 const deps={type:'tv',id:123,seasonNumber:1,...adapter,fetchSeason:async()=>{
  fetches++;return {name:'取得',episodes:[]};
 }};
 const hit=await getCachedSeason(deps);
 assert.equal(hit.season_name,'第1期');
 assert.equal(fetches,0,'cache hit must not fetch TMDB');
 // Concurrent cache misses: both may fetch, but NX allows only one stored winner.
 const concurrent={...deps,id:456,fetchSeason:async()=>{
  fetches++;return {name:'取得',episodes:[]};
 }};
 const results=await Promise.all([getCachedSeason(concurrent),getCachedSeason(concurrent)]);
 assert.equal(results.length,2);
 assert.equal(storage.size,2,'concurrent inserts must store one key');
 assert.equal(sets,4,'one initial SET, one rejected overwrite, two concurrent NX SETs');
 assert.equal((await adapter.getRecord('tv',456,1)).seasonName,'取得');
 assert.throws(()=>createSeasonRedisAdapter(null),/required/);
 console.log('season ledger mocked Redis NX/concurrency tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
