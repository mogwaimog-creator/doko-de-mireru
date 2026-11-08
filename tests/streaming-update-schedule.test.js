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

test('failed first fetch waits 30 minutes before retry',()=>{
 const r={lastSuccessAt:null,lastAttemptAt:'2026-11-08T00:00:00Z'};
 assert.equal(decide(r,{at:'2026-11-08T00:29:59Z'}).reason,'retry-cooldown');
 assert.equal(decide(r,{at:'2026-11-08T00:30:00Z'}).due,true);
});
test('failed refresh retains stale success but throttles immediate retry',()=>{
 const r={lastSuccessAt:'2026-11-07T00:00:00Z',lastAttemptAt:'2026-11-08T00:01:00Z'};
 const d=decide(r,{at:'2026-11-08T00:02:00Z'});
 assert.equal(d.reason,'retry-cooldown');
 assert.equal(d.retryAt,'2026-11-08T00:31:00.000Z');
});
test('fresh success overrides old failed attempt',()=>{
 const r={lastSuccessAt:'2026-11-08T00:05:00Z',lastAttemptAt:'2026-11-08T00:01:00Z'};
 assert.equal(decide(r,{at:'2026-11-08T00:06:00Z'}).reason,'fresh');
});
