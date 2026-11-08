'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {preparePerson,keyFor}=require('../api/_person-ledger-v2');
function fakeRedis(){
 const values=new Map();
 const command=async args=>{
  const [op,key,...rest]=args;
  if(op==='GET')return values.get(key)||null;
  if(op==='SET'){
   if(rest.includes('NX')&&values.has(key))return null;
   values.set(key,rest[0]);return 'OK';
  }
  if(op==='EVAL'){
   const lock=rest[2],token=rest[3];
   if(values.get(lock)===token){values.delete(lock);return 1;}
   return 0;
  }
  throw Error('unsupported command: '+op);
 };
 return {command,values};
}
const sample={id:1813,name:'Sample',cast:[{id:101,media_type:'movie',title:'Film',release_date:'2020-01-01'}]};
test('first access saves v2 record, subsequent access reuses without upstream call',async()=>{
 const db=fakeRedis();let loads=0;
 const load=async()=>{loads++;return sample};
 const first=await preparePerson({command:db.command,id:1813,load,now:()=>Date.parse('2026-01-01T00:00:00Z'),allowWrites:true});
 assert.equal(first.source,'created');assert.equal(loads,1);
 assert.equal(first.record.createdAt,'2026-01-01T00:00:00.000Z');
 const second=await preparePerson({command:db.command,id:1813,load,now:()=>Date.parse('2026-01-02T00:00:00Z'),allowWrites:true});
 assert.equal(second.source,'cache');assert.equal(loads,1);
 assert.deepEqual(Object.keys(second.person.cast[0]),['id','media_type','title','year','poster_path']);
});
test('60 day refresh keeps initial creation timestamp',async()=>{
 const db=fakeRedis();let loads=0;
 const load=async()=>({...sample,name:++loads===1?'Before':'After'});
 await preparePerson({command:db.command,id:1813,load,now:()=>Date.parse('2026-01-01T00:00:00Z'),allowWrites:true});
 const refreshed=await preparePerson({command:db.command,id:1813,load,now:()=>Date.parse('2026-03-02T00:00:00Z'),allowWrites:true});
 assert.equal(refreshed.source,'refreshed');assert.equal(refreshed.person.name,'After');
 assert.equal(refreshed.record.createdAt,'2026-01-01T00:00:00.000Z');
 assert.equal(refreshed.record.checkedAt,'2026-03-02T00:00:00.000Z');
 assert.equal(loads,2);
});
test('failed refresh preserves existing record and its checkedAt',async()=>{
 const db=fakeRedis();
 await preparePerson({command:db.command,id:1813,load:async()=>sample,now:()=>Date.parse('2026-01-01T00:00:00Z'),allowWrites:true});
 const before=db.values.get(keyFor(1813));
 const result=await preparePerson({command:db.command,id:1813,load:async()=>{throw Error('upstream unavailable')},now:()=>Date.parse('2026-03-02T00:00:00Z'),allowWrites:true});
 assert.equal(result.source,'stale-cache');
 assert.equal(db.values.get(keyFor(1813)),before);
});
test('read-only preview does not write even when record is missing',async()=>{
 const db=fakeRedis();
 const result=await preparePerson({command:db.command,id:1813,load:async()=>sample,allowWrites:false});
 assert.equal(result.source,'upstream-unsaved');assert.equal(db.values.size,0);
});
