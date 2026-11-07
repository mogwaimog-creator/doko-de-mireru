'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');const {controller}=require('../prototype/streaming-ledger-controller');
const works=[{type:'movie',id:1,memberships:[{kind:'watchOrder',scope:'godzilla'}]},{type:'tv',id:7,memberships:[]}];
const response={JP:{flatrate:[{providerId:8,name:'Netflix'}]}};
test('06 JST series cron, no visitor refresh, no second same-day cron',async()=>{
 const s=store();let calls=0;const c=controller(s,async()=>{calls++;return response});
 assert.equal((await c.visit('movie',1,'2026-11-07T01:00:00Z',works)).reason,'series-uses-cron');
 assert.equal((await c.cron('2026-11-06T20:59:00Z',works))[0].reason,'before-six-jst');
 assert.equal((await c.cron('2026-11-06T21:00:00Z',works))[0].updated,true);
 assert.equal((await c.cron('2026-11-06T21:01:00Z',works))[0].reason,'already-processed-today');
 assert.equal(calls,1);assert.equal(s.watchOrder('movie',1).length,1);
});
test('nonseries visit only after 24h; membership changes switch policies',async()=>{
 const s=store();let calls=0;const c=controller(s,async()=>{calls++;return response});
 assert.equal((await c.visit('tv',7,'2026-11-07T00:00:00Z',works)).updated,true);
 assert.equal((await c.visit('tv',7,'2026-11-07T23:59:00Z',works)).updated,false);
 assert.equal((await c.visit('tv',7,'2026-11-08T00:00:00Z',works)).updated,true);
 assert.equal(calls,2);
 const removed=[{type:'movie',id:1,memberships:[]}];
 assert.equal((await c.visit('movie',1,'2026-11-08T01:00:00Z',removed)).updated,true);
});
test('failure keeps old data and allows next cron retry',async()=>{
 const s=store();let calls=0;const c=controller(s,async()=>{calls++;if(calls===2)throw Error('temporary failure');return response});
 await c.cron('2026-11-06T21:00:00Z',works);
 const previous=s.detail('movie',1).lastSuccessAt;
 assert.equal((await c.cron('2026-11-07T21:00:00Z',works))[0].reason,'failed');
 assert.equal(s.detail('movie',1).lastSuccessAt,previous);
 assert.equal((await c.cron('2026-11-07T21:10:00Z',works))[0].updated,true);
 assert.equal(s.audit().errors,0);
});
test('concurrent same-work visits share in-flight guard',async()=>{
 const s=store();let resolve;const promise=new Promise(r=>resolve=r);
 const c=controller(s,async()=>{await promise;return response});
 const first=c.visit('tv',7,'2026-11-07T00:00:00Z',works);
 const second=await c.visit('tv',7,'2026-11-07T00:00:00Z',works);
 assert.equal(second.reason,'in-flight');resolve();assert.equal((await first).updated,true);
});
