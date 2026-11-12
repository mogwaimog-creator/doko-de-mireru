'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');
const T='2026-11-08T06:00:00.000Z';
test('registered but never fetched is unknown, not confirmed empty',()=>{
 const ledger=store();ledger.register('movie',42);
 const d=ledger.detail('movie',42);
 assert.equal(d.lastSuccessAt,null);
 assert.deepEqual(d.japan.flatrate,[]);
});
test('successful JP empty availability is confirmed and next eligible after 24h',()=>{
 const ledger=store();ledger.register('movie',42);
 ledger.success('movie',42,{JP:{flatrate:[],rent:[],buy:[]}},T);
 assert.equal(ledger.detail('movie',42).lastSuccessAt,T);
 assert.equal(ledger.eligible('movie',42,'2026-11-09T05:59:59Z',false),false);
 assert.equal(ledger.eligible('movie',42,'2026-11-09T06:00:00Z',false),true);
});
test('failure retains last success, prior providers and next eligible time',()=>{
 const ledger=store();ledger.register('tv',42);
 ledger.success('tv',42,{JP:{flatrate:[{provider_id:8,provider_name:'配信A'}]}},T);
 const before=ledger.detail('tv',42);
 ledger.failure('tv',42,'timeout','2026-11-09T06:01:00Z');
 const after=ledger.detail('tv',42);
 assert.equal(after.lastSuccessAt,before.lastSuccessAt);
 assert.equal(after.nextEligibleAt,before.nextEligibleAt);
 assert.deepEqual(after.japan,before.japan);
 assert.equal(after.lastAttemptAt,'2026-11-09T06:01:00.000Z');
 assert.equal(ledger.audit().errors,1);
});
test('failed first attempt is unknown, not confirmed empty',()=>{
 const ledger=store();ledger.register('movie',42);
 ledger.failure('movie',42,'timeout',T);
 assert.equal(ledger.detail('movie',42).lastSuccessAt,null);
});
test('movie and tv with same ID remain distinct',()=>{
 const ledger=store();ledger.register('movie',42);ledger.register('tv',42);
 ledger.success('movie',42,{JP:{flatrate:[]}},T);
 assert.equal(ledger.detail('tv',42).lastSuccessAt,null);
});
test('invalid JP payload cannot replace prior success',()=>{
 const ledger=store();ledger.register('movie',42);
 ledger.success('movie',42,{JP:{flatrate:[{provider_id:8,provider_name:'配信A'}]}},T);
 const before=ledger.detail('movie',42);
 assert.throws(()=>ledger.success('movie',42,{results:{}},'2026-11-09T06:00:00Z'));
 assert.deepEqual(ledger.detail('movie',42),before);
});
