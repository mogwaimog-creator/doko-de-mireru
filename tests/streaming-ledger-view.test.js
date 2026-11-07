'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');const {view}=require('../prototype/streaming-ledger-view');
test('first fetch in progress shows wait notice without fabricating empty availability',()=>{
 const s=store();s.register('movie',1);const v=view(s,'movie',1,{updating:true});
 assert.equal(v.state,'first-fetch');assert.equal(v.japan,null);assert.match(v.message,/しばらくしてから/);
});
test('concurrent update shows previously saved data immediately',()=>{
 const s=store();s.register('movie',1);s.success('movie',1,{JP:{flatrate:[{providerId:8,name:'Netflix'}]}},'2026-11-07T00:00:00Z');
 const v=view(s,'movie',1,{updating:true});assert.equal(v.state,'updating-cached');assert.equal(v.japan.flatrate[0].providerId,8);assert.equal(v.message,null);
});
test('failed refresh keeps previous availability and offers retry',()=>{
 const s=store();s.register('tv',7);s.success('tv',7,{JP:{rent:[{providerId:2,name:'Rental'}]}},'2026-11-07T00:00:00Z');
 const v=view(s,'tv',7,{failed:true});assert.equal(v.state,'stale-error');assert.equal(v.showRetry,true);assert.equal(v.japan.rent.length,1);
});
test('first fetch failure does not claim no streaming providers',()=>{
 const s=store();const v=view(s,'tv',7,{failed:true});assert.equal(v.state,'unavailable');assert.equal(v.japan,null);assert.equal(v.showRetry,true);
});
