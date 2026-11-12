'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');
const {seriesStreamingProviders}=require('../prototype/series-streaming-adapter');
test('shared ledger gives legacy flatrate cards without an additional fetch',()=>{
 const ledger=store();ledger.register('movie',100);
 ledger.success('movie',100,{JP:{flatrate:[{provider_id:8,provider_name:'配信A',logo_path:'/a.png'},{provider_id:8,provider_name:'配信A'}],rent:[{provider_id:9,provider_name:'レンタル'}],buy:[]}},'2026-11-08T06:00:00Z');
 assert.deepEqual(seriesStreamingProviders(ledger,'movie',100),[{provider_id:8,provider_name:'配信A',logo_path:'/a.png'}]);
});
test('unknown record stays unknown while confirmed empty is no streaming',()=>{
 const ledger=store();ledger.register('tv',100);
 assert.equal(seriesStreamingProviders(ledger,'tv',100),null);
 ledger.success('tv',100,{JP:{flatrate:[],rent:[],buy:[]}},'2026-11-08T06:00:00Z');
 assert.deepEqual(seriesStreamingProviders(ledger,'tv',100),[]);
});
test('same numeric movie and TV IDs cannot cross over',()=>{
 const ledger=store();ledger.register('movie',100);ledger.register('tv',100);
 ledger.success('movie',100,{JP:{flatrate:[{provider_id:8,provider_name:'映画'}]}},'2026-11-08T06:00:00Z');
 ledger.success('tv',100,{JP:{flatrate:[{provider_id:9,provider_name:'ドラマ'}]}},'2026-11-08T06:00:00Z');
 assert.equal(seriesStreamingProviders(ledger,'movie',100)[0].provider_id,8);
 assert.equal(seriesStreamingProviders(ledger,'tv',100)[0].provider_id,9);
});
