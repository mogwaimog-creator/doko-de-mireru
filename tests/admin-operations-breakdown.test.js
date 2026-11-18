'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const { _test:{authorized,decode} }=require('../api/admin-operations-breakdown');
test('requires the existing administrator token',()=>{
 const token='x'.repeat(40);
 assert.equal(authorized('Bearer '+token,token),true);
 assert.equal(authorized('Bearer '+token+'!',token),false);
 assert.equal(authorized('Bearer '+token,'short'),false);
 assert.equal(authorized(undefined,token),false);
});
test('handles missing and malformed operational records',()=>{
 assert.equal(decode(null),null);
 assert.deepEqual(decode('{"dailyScheduled":12}'),{dailyScheduled:12});
 assert.deepEqual(decode('broken'),{error:'invalid-record'});
});
