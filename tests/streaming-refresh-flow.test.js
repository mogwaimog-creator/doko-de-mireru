'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {refreshFlow}=require('../prototype/streaming-refresh-flow');
const {createDistributedLock}=require('../prototype/streaming-distributed-lock');
function setup(initial){
 let record=JSON.parse(JSON.stringify(initial)),calls=0;
 const locks=new Map();
 const lock=createDistributedLock({
  acquireAtomic:async(k,t)=>{if(locks.has(k))return false;locks.set(k,t);return true},
  releaseIfOwner:async(k,t)=>{if(locks.get(k)===t)locks.delete(k)}
 });
 return {lock,read:async()=>JSON.parse(JSON.stringify(record)),write:async(t,id,next)=>{record=JSON.parse(JSON.stringify(next))},get:()=>record,calls:()=>calls,fetchJapan:async()=>{calls++;return {flatrate:[],rent:[],buy:[]}}};
}
const at='2026-11-09T00:00:00Z';
test('successful refresh persists confirmed empty and 24h eligibility',async()=>{
 const io=setup({lastSuccessAt:null,lastAttemptAt:null,japan:{flatrate:[],rent:[],buy:[]},errors:[]});
 const out=await refreshFlow({...io,type:'movie',id:42,at,token:'unique-token-worker-01'});
 assert.equal(out.status,'success');assert.equal(io.calls(),1);
 assert.equal(io.get().lastSuccessAt,'2026-11-09T00:00:00.000Z');
 assert.equal(io.get().nextEligibleAt,'2026-11-10T00:00:00.000Z');
});
test('failed fetch preserves last success and providers',async()=>{
 const prior={lastSuccessAt:'2026-11-07T00:00:00Z',lastAttemptAt:null,japan:{flatrate:[{providerId:8}],rent:[],buy:[]},errors:[]};
 const io=setup(prior);
 const out=await refreshFlow({...io,fetchJapan:async()=>{throw Error('timeout')},type:'movie',id:42,at,token:'unique-token-worker-02'});
 assert.equal(out.status,'failed');assert.equal(io.get().lastSuccessAt,prior.lastSuccessAt);
 assert.deepEqual(io.get().japan,prior.japan);
});
test('scheduled watch-order refresh marks day even on fetch failure',async()=>{
 const io=setup({lastSuccessAt:null,lastAttemptAt:null,lastSeriesRunDay:null,japan:{flatrate:[],rent:[],buy:[]},errors:[]});
 const at6='2026-11-08T21:00:00Z';
 const a=await refreshFlow({...io,fetchJapan:async()=>{throw Error('timeout')},type:'tv',id:42,at:at6,watchOrder:true,scheduled:true,token:'unique-token-worker-03'});
 assert.equal(a.status,'failed');assert.equal(io.get().lastSeriesRunDay,'2026-11-09');
 const b=await refreshFlow({...io,type:'tv',id:42,at:'2026-11-08T22:00:00Z',watchOrder:true,scheduled:true,token:'unique-token-worker-04'});
 assert.equal(b.status,'skipped');assert.equal(io.calls(),0);
});
test('recheck inside lock prevents stale pre-lock decision',async()=>{
 const io=setup({lastSuccessAt:null,lastAttemptAt:null,japan:{flatrate:[],rent:[],buy:[]},errors:[]});
 const lock={run:async({refresh})=>{await io.write('movie',42,{...io.get(),lastSuccessAt:at});return {status:'updated',value:await refresh()}}};
 const out=await refreshFlow({...io,lock,type:'movie',id:42,at,token:'unique-token-worker-05'});
 assert.equal(out.status,'skipped');assert.equal(io.calls(),0);
});
