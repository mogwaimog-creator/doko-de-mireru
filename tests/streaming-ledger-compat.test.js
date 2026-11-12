'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');
const {fromTmdb,toDetail,toWatch}=require('../prototype/streaming-ledger-compat');
test('TMDB watch/providers is normalized once and reused for detail and watch order',()=>{
 const s=store();s.register('movie',1);s.success('movie',1,fromTmdb({results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix',logo_path:'/a.png'}],rent:[{provider_id:2,provider_name:'Rental',logo_path:'/b.png'}]},US:{flatrate:[{provider_id:9,provider_name:'US'}]}}}),'2026-11-07T00:00:00Z');
 assert.equal(toDetail(s,'movie',1).data.results.JP.rent[0].provider_id,2);
 assert.equal(toWatch(s,'movie',1).flatrate[0].provider_id,8);
 assert.equal(s.save().includes('US'),false);
});
test('no JP results means valid empty availability, not a missing response',()=>{
 const s=store();s.register('tv',2);s.success('tv',2,fromTmdb({results:{US:{flatrate:[]}}}),'2026-11-07T00:00:00Z');
 assert.deepEqual(toWatch(s,'tv',2).flatrate,[]);
});
test('unfetched work is distinct from confirmed no providers',()=>{
 const s=store();s.register('movie',3);assert.equal(toWatch(s,'movie',3),null);assert.equal(toDetail(s,'movie',3),null);
});
test('malformed TMDB payload is rejected without touching stored data',()=>{
 const s=store();s.register('movie',4);s.success('movie',4,fromTmdb({results:{JP:{flatrate:[{provider_id:8}]}}}),'2026-11-07T00:00:00Z');
 assert.throws(()=>fromTmdb({results:null}),/invalid TMDB/);
 assert.equal(toWatch(s,'movie',4).flatrate[0].provider_id,8);
});
