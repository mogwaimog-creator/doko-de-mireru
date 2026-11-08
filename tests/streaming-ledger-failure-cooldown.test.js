'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {decision}=require('../prototype/streaming-ledger-schedule');
const base={type:'movie',id:42,lastSuccessAt:null,lastAttemptAt:'2026-11-08T00:00:00Z',errors:[{status:'open',message:'timeout'}],lastSeriesRunDay:null,seriesKeys:new Set(),trigger:'visit'};
test('initial failure blocks repeated visits for 15 minutes',()=>{
 assert.equal(decision({...base,now:'2026-11-08T00:01:00Z'}).reason,'failure-cooldown');
 assert.equal(decision({...base,now:'2026-11-08T00:14:59Z'}).fetch,false);
 assert.equal(decision({...base,now:'2026-11-08T00:15:00Z'}).fetch,true);
});
test('failure cooldown does not override daily series cron',()=>{
 const s={...base,seriesKeys:new Set(['movie:42']),trigger:'cron',now:'2026-11-08T00:00:00Z'};
 assert.equal(decision(s).reason,'series-six-jst');
});
test('resolved errors and prior successful cache use normal schedule',()=>{
 assert.equal(decision({...base,errors:[{status:'resolved'}],now:'2026-11-08T00:01:00Z'}).fetch,true);
 assert.equal(decision({...base,lastSuccessAt:'2026-11-08T00:00:00Z',errors:[],now:'2026-11-08T00:01:00Z'}).reason,'cached');
});
