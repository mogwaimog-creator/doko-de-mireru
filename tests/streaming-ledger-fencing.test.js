'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');const {controller}=require('../prototype/streaming-ledger-controller');const {lease,memoryAdapter}=require('../prototype/streaming-ledger-lease');
const works=[{type:'movie',id:1,memberships:[{kind:'watchOrder',scope:'godzilla'}]}];
test('expired lease cannot overwrite newer streaming information',async()=>{
 const adapter=memoryAdapter(),s=store();s.register('movie',1);
 s.success('movie',1,{JP:{flatrate:[{providerId:8,name:'Original'}]}},'2026-11-06T21:00:00Z');
 let finish;const waiting=new Promise(r=>finish=r);
 const old=controller(s,async()=>{await waiting;return {JP:{flatrate:[{providerId:9,name:'Stale'}]}}},{distributedLease:lease(adapter,{ttlMs:5})});
 const first=old.cron('2026-11-07T21:00:00Z',works);
 await new Promise(r=>setTimeout(r,15));
 const fresh=controller(s,async()=>({JP:{flatrate:[{providerId:10,name:'Fresh'}]}}),{distributedLease:lease(adapter,{ttlMs:500})});
 assert.equal((await fresh.cron('2026-11-07T21:01:00Z',works))[0].updated,true);
 finish();
 assert.equal((await first)[0].reason,'lease-expired-or-disabled');
 assert.equal(s.watchOrder('movie',1)[0].name,'Fresh');
});
test('expired owner cannot release newer owner lease',async()=>{
 const a=memoryAdapter();await a.acquire('movie:1','old',1);await new Promise(r=>setTimeout(r,5));assert.equal(await a.acquire('movie:1','new',1000),true);assert.equal(await a.release('movie:1','old'),false);assert.equal(a.inspect('movie:1').token,'new');
});
