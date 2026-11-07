'use strict';
const assert=require('node:assert/strict');
const {DAY,seasonRefreshDue}=require('../api/_season-refresh-policy');
const now=Date.parse('2026-11-07T00:00:00Z');
const at=ms=>new Date(now-ms).toISOString();
for(const status of ['unknown','airing']){
 assert.equal(seasonRefreshDue({checkedAt:at(7*DAY-1),status,now}),false);
 assert.equal(seasonRefreshDue({checkedAt:at(7*DAY),status,now}),true);
}
assert.equal(seasonRefreshDue({checkedAt:at(90*DAY-1),status:'completed',now}),false);
assert.equal(seasonRefreshDue({checkedAt:at(90*DAY),status:'completed',now}),true);
assert.equal(seasonRefreshDue({checkedAt:'invalid',status:'completed',now}),true);
assert.equal(seasonRefreshDue({checkedAt:new Date(now+60001).toISOString(),now}),true);
assert.equal(seasonRefreshDue({checkedAt:null,status:'completed',now}),true);
console.log('season refresh 7-day/90-day boundary tests passed');
