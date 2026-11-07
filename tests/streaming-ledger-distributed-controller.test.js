'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');const {controller}=require('../prototype/streaming-ledger-controller');
const {lease,memoryAdapter}=require('../prototype/streaming-ledger-lease');
const works=[{type:'movie',id:1,memberships:[{kind:'watchOrder',scope:'godzilla'}]}];
test('two controllers cannot concurrently fetch same movie using shared lease',async()=>{
 const adapter=memoryAdapter(),sharedLease=lease(adapter);let releaseFetch;const blocked=new Promise(r=>releaseFetch=r);let calls=0;
 const fetch=async()=>{calls++;await blocked;return {JP:{flatrate:[{providerId:8,name:'Netflix'}]}}};
 const a=controller(store(),fetch,{distributedLease:sharedLease}),b=controller(store(),fetch,{distributedLease:sharedLease});
 const first=a.cron('2026-11-06T21:00:00Z',works);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 const second=await b.cron('2026-11-06T21:00:00Z',works);
 assert.equal(second[0].reason,'distributed-in-flight');releaseFetch();assert.equal((await first)[0].updated,true);assert.equal(calls,1);
});
