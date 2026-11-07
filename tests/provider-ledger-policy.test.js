'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const p=require('../api/_provider-ledger-policy');
const at=s=>Date.parse(s);
test('one identity for a work irrespective of its pages',()=>{
 assert.equal(p.workKey('movie',671),'movie:671');
 assert.deepEqual(p.normalizeSeriesIds(['hp','hp','wizard']),['hp','wizard']);
 assert.equal(p.policyFor(['hp']),'watch-order-daily-06-jst');
 assert.equal(p.policyFor([]),'on-demand-24h');
});
test('watch-order refreshes once at 06:00 JST, never again that day',()=>{
 const checkedAt='2026-11-06T21:00:00.000Z'; // Nov 7, 06:00 JST
 const record={checkedAt,watchOrderSeriesIds:['hp']};
 assert.equal(p.refreshDue(record,at('2026-11-07T20:59:59Z')),false);
 assert.equal(p.refreshDue(record,at('2026-11-07T21:00:00Z')),true);
});
test('non-series uses 24h since last successful refresh',()=>{
 const record={checkedAt:'2026-11-07T00:00:00Z',watchOrderSeriesIds:[]};
 assert.equal(p.refreshDue(record,at('2026-11-07T23:59:59Z')),false);
 assert.equal(p.refreshDue(record,at('2026-11-08T00:00:00Z')),true);
});
test('Japanese provider data only and no duplicate series memberships',()=>{
 const record=p.normalizeProviderRecord('movie',671,{
  watchOrderSeriesIds:['hp','hp'],
  checkedAt:'2026-11-07T00:00:00Z',
  data:{results:{JP:{flatrate:[{provider_id:8}]},US:{buy:[{provider_id:1}]}}}
 });
 assert.deepEqual(Object.keys(record.data.results),['JP']);
 assert.deepEqual(record.watchOrderSeriesIds,['hp']);
 assert.equal(record.workKey,'movie:671');
});
