'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');
const {fromTmdb,toDetail,toWatch}=require('../prototype/streaming-ledger-compat');
test('detail shape matches search.js providerData.results.JP and all three categories',()=>{
 const ledger=store();ledger.register('movie',7);
 ledger.success('movie',7,fromTmdb({results:{JP:{
 flatrate:[{provider_id:8,provider_name:'Netflix',logo_path:'/n.png'}],
 rent:[{provider_id:2,provider_name:'Rent',logo_path:'/r.png'}],
 buy:[{provider_id:3,provider_name:'Buy',logo_path:'/b.png'}]
 },US:{flatrate:[{provider_id:999}]}}}),'2026-11-08T00:00:00Z');
 const detail=toDetail(ledger,'movie',7);
 assert.deepEqual(Object.keys(detail.data.results),['JP']);
 assert.deepEqual(detail.data.results.JP.flatrate,[{provider_id:8,provider_name:'Netflix',logo_path:'/n.png'}]);
 assert.equal(detail.data.results.JP.rent[0].provider_id,2);
 assert.equal(detail.data.results.JP.buy[0].provider_id,3);
 assert.equal(detail.checkedAt,'2026-11-08T00:00:00.000Z');
 const watch=toWatch(ledger,'movie',7);
 assert.deepEqual(watch.flatrate,detail.data.results.JP.flatrate);
 assert.equal(watch.rent,undefined);
 assert.equal(watch.buy,undefined);
});
test('TV detail uses same provider envelope and independent movie/tv identities',()=>{
 const ledger=store();ledger.register('movie',10);ledger.register('tv',10);
 ledger.success('tv',10,fromTmdb({results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix'}]}}}),'2026-11-08T00:00:00Z');
 assert.equal(toDetail(ledger,'movie',10),null);
 assert.equal(toDetail(ledger,'tv',10).data.results.JP.flatrate[0].provider_id,8);
});
test('unknown or failed first fetch is not presented as confirmed empty availability',()=>{
 const ledger=store();ledger.register('movie',9);
 ledger.failure('movie',9,'timeout','2026-11-08T00:00:00Z');
 assert.equal(toDetail(ledger,'movie',9),null);
 assert.equal(toWatch(ledger,'movie',9),null);
});
test('successful empty JP result is distinct from unknown availability',()=>{
 const ledger=store();ledger.register('movie',11);
 ledger.success('movie',11,fromTmdb({results:{}}),'2026-11-08T00:00:00Z');
 assert.deepEqual(toDetail(ledger,'movie',11).data.results.JP.flatrate,[]);
 assert.deepEqual(toWatch(ledger,'movie',11).flatrate,[]);
});
