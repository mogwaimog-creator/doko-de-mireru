'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {store:workStore}=require('../prototype/work-ledger');
const {store:streamStore}=require('../prototype/streaming-ledger');
const {createSeoRecord}=require('../prototype/seo-ledger');
test('same movie and TV ID remain separate across work, SEO and streaming ledgers',()=>{
 const works=workStore(),stream=streamStore();
 for(const type of ['movie','tv']){
  works.register(type,42,{title:type==='movie'?'映画':'ドラマ'});
  stream.register(type,42);
 }
 stream.success('movie',42,{JP:{flatrate:[{provider_id:8,provider_name:'サービスA',logo_path:'/a.png'}],rent:[],buy:[]}},'2026-11-08T06:00:00Z');
 stream.success('tv',42,{JP:{flatrate:[{provider_id:9,provider_name:'サービスB',logo_path:'/b.png'}],rent:[],buy:[]}},'2026-11-08T06:00:00Z');
 assert.equal(stream.watchOrder('movie',42)[0].providerId,8);
 assert.equal(stream.watchOrder('tv',42)[0].providerId,9);
 assert.notEqual(createSeoRecord(works.display('movie',42)).canonical,createSeoRecord(works.display('tv',42)).canonical);
 assert.equal(stream.audit().duplicates,0);
});
test('streaming failure preserves last successful Japan availability',()=>{
 const stream=streamStore();stream.register('movie',77);
 stream.success('movie',77,{JP:{flatrate:[{provider_id:8,provider_name:'サービスA'}],rent:[],buy:[]}},'2026-11-08T06:00:00Z');
 stream.failure('movie',77,'temporary failure','2026-11-08T18:00:00Z');
 assert.equal(stream.watchOrder('movie',77)[0].providerId,8);
 assert.equal(stream.detail('movie',77).lastSuccessAt,'2026-11-08T06:00:00.000Z');
 assert.equal(stream.audit().errors,1);
});
test('streaming ledger rejects absent Japan data and deduplicates providers',()=>{
 const stream=streamStore();stream.register('movie',88);
 assert.throws(()=>stream.success('movie',88,{US:{flatrate:[]}},'2026-11-08T06:00:00Z'),/missing Japan/);
 stream.success('movie',88,{JP:{flatrate:[{provider_id:8},{provider_id:8}],rent:[],buy:[]}},'2026-11-08T06:00:00Z');
 assert.equal(stream.watchOrder('movie',88).length,1);
});
