'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');
test('repeated errors stay one entry and survive save/load',()=>{
 const a=store();a.register('movie',1);
 a.failure('movie',1,'timeout','2026-11-08T06:00:00+09:00');
 a.failure('movie',1,'timeout','2026-11-09T06:00:00+09:00');
 const b=store();b.load(a.save());
 assert.equal(b.get('movie',1).errors.length,1);
 assert.equal(b.get('movie',1).errors[0].count,2);
 assert.equal(b.get('movie',1).errors[0].lastAt,'2026-11-08T21:00:00.000Z');
});
test('success preserves previous data after failure and resolves error',()=>{
 const a=store();a.register('movie',2);
 a.success('movie',2,{JP:{flatrate:[{providerId:8,name:'Example'}]}},'2026-11-07T06:00:00+09:00');
 a.failure('movie',2,'timeout','2026-11-08T06:00:00+09:00');
 assert.equal(a.get('movie',2).japan.flatrate.length,1);
 assert.equal(a.get('movie',2).lastSuccessAt,'2026-11-06T21:00:00.000Z');
 a.success('movie',2,{JP:{flatrate:[]}},'2026-11-09T06:00:00+09:00');
 a.resolve('movie',2);
 assert.equal(a.get('movie',2).errors[0].status,'resolved');
});