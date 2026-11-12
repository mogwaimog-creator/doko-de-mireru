'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');
test('single Japanese provider record reused for detail and watch order',()=>{
 const s=store();assert.equal(s.register('movie',1),true);assert.equal(s.register('movie',1),false);
 s.success('movie',1,{JP:{flatrate:[{providerId:8,name:'Netflix',logoPath:'/n.png'},{providerId:8,name:'duplicate'}],rent:[{providerId:2,name:'Rental'}],buy:[{providerId:3,name:'Purchase'}]},US:{flatrate:[{providerId:999,name:'US'}]}},'2026-11-07T00:00:00Z');
 assert.deepEqual(s.watchOrder('movie',1).map(x=>x.providerId),[8]);assert.equal(s.detail('movie',1).japan.rent[0].providerId,2);assert.equal(s.save().includes('US'),false);
 assert.equal(s.eligible('movie',1,'2026-11-07T12:00:00Z',false),false);assert.equal(s.eligible('movie',1,'2026-11-08T00:00:00Z',false),true);
 assert.equal(s.eligible('movie',1,'2026-11-07T12:00:00Z',true),false);
});
test('failed update keeps last successful data and timestamp; reload reuses same record',()=>{
 const s=store();s.register('tv',7);s.success('tv',7,{JP:{flatrate:[{providerId:8,name:'A'}]}},'2026-11-07T00:00:00Z');
 const before=s.detail('tv',7);s.failure('tv',7,'provider timeout','2026-11-08T00:01:00Z');s.failure('tv',7,'provider timeout','2026-11-08T00:02:00Z');
 assert.deepEqual(s.detail('tv',7).japan,before.japan);assert.equal(s.detail('tv',7).lastSuccessAt,before.lastSuccessAt);assert.equal(s.audit().errors,1);
 const copy=store();copy.load(s.save());assert.deepEqual(copy.watchOrder('tv',7),s.watchOrder('tv',7));assert.equal(copy.audit().count,1);
 copy.resolve('tv',7);assert.equal(copy.audit().errors,0);
});
test('missing Japan data does not erase existing data',()=>{
 const s=store();s.register('movie',2);s.success('movie',2,{JP:{flatrate:[{providerId:1,name:'A'}]}},'2026-11-07T00:00:00Z');
 assert.throws(()=>s.success('movie',2,{US:{}},'2026-11-08T00:00:00Z'),/missing Japan/);
 assert.equal(s.watchOrder('movie',2).length,1);
});
