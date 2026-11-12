'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {membershipSet,decision}=require('../prototype/streaming-ledger-schedule');
test('watch order membership selects series without duplicating work',()=>{
 const s=membershipSet([{type:'movie',id:1,memberships:[{kind:'feature'},{kind:'watchOrder',scope:'godzilla'}]},{type:'tv',id:2,memberships:[{kind:'feature'}]}]);assert.deepEqual([...s],['movie:1']);
});
test('series refresh at 06:00 JST by cron only, not on visits',()=>{
 const seriesKeys=new Set(['movie:1']),base={type:'movie',id:1,lastSuccessAt:'2026-11-06T21:00:00Z',seriesKeys,lastSeriesRunDay:'2026-11-06'};
 assert.equal(decision({...base,now:'2026-11-07T20:00:00Z',trigger:'visit'}).fetch,false);
 assert.equal(decision({...base,now:'2026-11-06T20:59:59Z',trigger:'cron'}).fetch,false);
 assert.equal(decision({...base,now:'2026-11-06T21:00:00Z',trigger:'cron'}).fetch,true);
 assert.equal(decision({...base,now:'2026-11-06T21:05:00Z',trigger:'cron',lastSeriesRunDay:'2026-11-07'}).fetch,false);
});
test('non-series: initial visit and >=24h visit, never cron',()=>{
 const base={type:'tv',id:2,seriesKeys:new Set(),lastSeriesRunDay:null};
 assert.equal(decision({...base,lastSuccessAt:null,now:'2026-11-07T00:00:00Z',trigger:'visit'}).fetch,true);
 assert.equal(decision({...base,lastSuccessAt:'2026-11-07T00:00:00Z',now:'2026-11-07T23:59:59Z',trigger:'visit'}).fetch,false);
 assert.equal(decision({...base,lastSuccessAt:'2026-11-07T00:00:00Z',now:'2026-11-08T00:00:00Z',trigger:'visit'}).fetch,true);
 assert.equal(decision({...base,lastSuccessAt:null,now:'2026-11-08T00:00:00Z',trigger:'cron'}).fetch,false);
});
test('series removal returns to visit-only policy',()=>{
 const base={type:'movie',id:1,lastSuccessAt:'2026-11-05T00:00:00Z',now:'2026-11-08T00:00:00Z',lastSeriesRunDay:null};
 assert.equal(decision({...base,seriesKeys:new Set(['movie:1']),trigger:'visit'}).fetch,false);
 assert.equal(decision({...base,seriesKeys:new Set(),trigger:'visit'}).fetch,true);
});
