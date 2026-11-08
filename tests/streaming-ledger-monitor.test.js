'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {summarize}=require('../prototype/streaming-ledger-monitor');
test('report classifies errors and deferrals without changing records',()=>{
 const record={type:'movie',id:1,lastSuccessAt:'2026-11-06T00:00:00.000Z'};
 const before=JSON.stringify(record);
 const report=summarize([{updated:false,reason:'failed',error:'timeout',record},{updated:false,reason:'deferred-budget'},{updated:true,record:{type:'tv',id:3}}],[{type:'movie',id:1},{type:'movie',id:2},{type:'tv',id:3}],{at:'2026-11-07'});
 assert.equal(report.counts.failed,1);assert.equal(report.counts.deferred,1);assert.equal(report.counts.updated,1);
 assert.equal(report.needsAttention[0].hasSavedData,true);assert.equal(report.needsAttention[1].key,'movie:2');
 assert.equal(JSON.stringify(record),before);assert.equal(report.healthy,false);
});
test('report distinguishes lock contention from failure',()=>{
 const report=summarize([{reason:'in-flight'},{reason:'cached'},{reason:'writes-disabled'}],[{type:'movie',id:1},{type:'movie',id:2},{type:'movie',id:3}]);
 assert.equal(report.counts.locked,1);assert.equal(report.counts.failed,0);assert.equal(report.counts.disabled,1);assert.equal(report.needsAttention.length,1);
});
test('empty batch is healthy and safe',()=>{const r=summarize([],[]);assert.equal(r.processed,0);assert.equal(r.healthy,true)});
test('unexpected results are explicitly counted',()=>{const r=summarize([{}],[{type:'movie',id:1}]);assert.equal(r.counts.unknown,1);assert.equal(r.healthy,false)});
