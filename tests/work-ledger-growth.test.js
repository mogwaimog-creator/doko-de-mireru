'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/work-ledger');
test('repeated identical unresolved errors do not grow storage',()=>{
 const s=store();s.register('movie',1,{title:'A'});
 const id=s.error('movie',1,'poster missing');const before=s.save();
 for(let i=0;i<1000;i++)assert.equal(s.error('movie',1,'poster missing'),id);
 assert.equal(s.save(),before);assert.equal(s.audit().errorCount,1);
});
test('resolved error history remains; a new occurrence can be recorded',()=>{
 const s=store();s.register('movie',1,{title:'A'});
 const first=s.error('movie',1,'poster missing');s.resolve('movie',1,first);
 const second=s.error('movie',1,'poster missing');assert.notEqual(first,second);
 assert.equal(s.audit().errorCount,2);assert.equal(s.errors()[0].status,'resolved');
});
test('size audit flags large records and remains stable after reads',()=>{
 const s=store();s.register('movie',1,{title:'A',overview:'長'.repeat(4000)});
 s.member('movie',1,'feature','one',{note:'長'.repeat(1000)});
 s.member('movie',1,'feature','two',{note:'長'.repeat(1000)});
 assert.deepEqual(s.audit().oversized,['movie:1']);
 const before=s.save();for(let i=0;i<100;i++){s.display('movie',1);s.audit()}
 assert.equal(s.save(),before);
});