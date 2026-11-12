'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');const {controller}=require('../prototype/streaming-ledger-controller');const {lease,memoryAdapter}=require('../prototype/streaming-ledger-lease');
const works=[{type:'movie',id:1,memberships:[{kind:'watchOrder',scope:'godzilla'}]}];
test('disabled writes prevent registration and fetch',async()=>{
 const s=store();let calls=0;const c=controller(s,async()=>{calls++;return {JP:{}}},{writesEnabled:()=>false});
 const result=await c.cron('2026-11-06T21:00:00Z',works);
 assert.equal(result[0].reason,'writes-disabled');assert.equal(calls,0);assert.equal(s.audit().count,0);
});
test('writes disabled during fetch cannot overwrite saved streaming data',async()=>{
 const s=store();s.register('movie',1);s.success('movie',1,{JP:{flatrate:[{providerId:8,name:'Old'}]}},'2026-11-06T21:00:00Z');
 let enabled=true,release;const waiting=new Promise(r=>release=r);
 const c=controller(s,async()=>{await waiting;return {JP:{flatrate:[{providerId:9,name:'New'}]}}},{writesEnabled:()=>enabled});
 const pending=c.cron('2026-11-07T21:00:00Z',works);enabled=false;release();
 assert.equal((await pending)[0].reason,'writes-disabled');assert.equal(s.watchOrder('movie',1)[0].name,'Old');
});
test('disabled write in leased update is rejected without saving',async()=>{
 const s=store();s.register('movie',1);let enabled=true,release;const waiting=new Promise(r=>release=r);
 const c=controller(s,async()=>{await waiting;return {JP:{flatrate:[{providerId:9,name:'New'}]}}},{writesEnabled:()=>enabled,distributedLease:lease(memoryAdapter())});
 const pending=c.cron('2026-11-06T21:00:00Z',works);await Promise.resolve();await Promise.resolve();enabled=false;release();
 assert.equal((await pending)[0].updated,false);assert.equal(s.detail('movie',1).lastSuccessAt,null);
});
