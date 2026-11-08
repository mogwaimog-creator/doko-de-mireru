'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {decide}=require('../prototype/streaming-update-schedule');
const at='2026-11-08T21:00:00Z'; // 2026-11-09 06:00 JST
test('watch-order updates only in scheduled 06:00 JST run',()=>{
 const record={lastSeriesRunDay:'2026-11-08'};
 assert.equal(decide(record,{at,watchOrder:true,scheduled:false}).due,false);
 assert.equal(decide(record,{at:'2026-11-08T20:59:59Z',watchOrder:true,scheduled:true}).due,false);
 assert.equal(decide(record,{at,watchOrder:true,scheduled:true}).due,true);
});
test('watch-order cannot be attempted twice on same JST day',()=>{
 const record={lastSeriesRunDay:'2026-11-09'};
 assert.equal(decide(record,{at,watchOrder:true,scheduled:true}).due,false);
});
test('other works refresh on first access after 24h since success',()=>{
 const record={lastSuccessAt:'2026-11-08T00:00:00Z'};
 assert.equal(decide(record,{at:'2026-11-08T23:59:59Z'}).due,false);
 assert.equal(decide(record,{at:'2026-11-09T00:00:00Z'}).due,true);
});
test('other works with no success are eligible for first fetch',()=>{
 assert.equal(decide({lastSuccessAt:null},{at}).due,true);
});
test('failed refresh does not change 24h-from-last-success rule',()=>{
 const record={lastSuccessAt:'2026-11-07T00:00:00Z',lastAttemptAt:'2026-11-08T01:00:00Z'};
 assert.equal(decide(record,{at:'2026-11-08T02:00:00Z'}).due,true);
});
test('JST day boundary is not UTC day boundary',()=>{
 const record={lastSeriesRunDay:'2026-11-08'};
 assert.equal(decide(record,{at:'2026-11-08T21:00:00Z',watchOrder:true,scheduled:true}).runDay,'2026-11-09');
});
