'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/work-ledger');
test('error log is stored once, global list is derived and survives reload',()=>{
 const s=store();s.register('movie',1,{title:'A'});
 const eid=s.error('movie',1,'poster missing');
 assert.equal(s.errors().length,1);
 let raw=JSON.parse(s.save());
 assert.equal(Object.hasOwn(raw,'errorLog'),false);
 assert.equal(raw.records[0].errors.length,1);
 s.resolve('movie',1,eid);
 const t=store();t.load(s.save());
 assert.equal(t.errors()[0].status,'resolved');
 assert.equal(t.audit().errorCount,1);
});
test('100 reads and automatic updates after confirmation do not grow saved data',()=>{
 const s=store();s.register('movie',2,{title:'Original',overview:'Text'});s.confirm('movie',2);
 const before=s.save();
 for(let i=0;i<100;i++){s.display('movie',2);s.automatic('movie',2,{title:'Wrong',overview:'Overwrite'});s.audit();}
 assert.equal(s.save(),before);
});
test('legacy saves with a duplicate global errorLog can load and re-save without duplication',()=>{
 const s=store();s.register('tv',3,{title:'Series'});const eid=s.error('tv',3,'missing');
 const legacy=JSON.parse(s.save());legacy.errorLog=[{key:'tv:3',eid,message:'missing',status:'open'}];
 const t=store();t.load(JSON.stringify(legacy));
 assert.equal(t.errors().length,1);
 assert.equal(Object.hasOwn(JSON.parse(t.save()),'errorLog'),false);
});