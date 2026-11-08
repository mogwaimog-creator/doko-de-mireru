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
   const keys=Number(rest[1]),lock=rest[2];
   if(keys===1){
    const token=rest[3];
    if(values.get(lock)===token){values.delete(lock);return 1;}
    return 0;
   }
   if(keys===2){
    const destination=rest[3],token=rest[4],value=rest[5];
    if(values.get(lock)===token){values.set(destination,value);return 1;}
    return 0;
   }
   throw Error('unsupported EVAL key count');
  }
  throw Error('unsupported command: '+op);
 };
 return {command,values};
}
const sample={id:1813,name:'Sample',cast:[{id:101,media_type:'movie',title:'Film',release_date:'2020-01-01'}],voice:[],directed:[],documentary_talk:[],other:[]};
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

test('lost refresh lease cannot overwrite another worker record',async()=>{
 const db=fakeRedis();const stamp=()=>Date.parse('2026-01-01T00:00:00Z');
 const load=async()=>{
  // Simulate lease expiration and a newer worker acquiring the lock.
  for(const key of [...db.values.keys()])if(key.endsWith(':refresh-lock'))db.values.delete(key);
  return sample;
 };
 await assert.rejects(
  preparePerson({command:db.command,id:1813,load,now:stamp,allowWrites:true}),
  /lock expired/
 );
 assert.equal(db.values.has(keyFor(1813)),false);
});

test('oversized filmography is rejected without partial save or truncation',async()=>{
 const db=fakeRedis();
 const huge={...sample,cast:Array.from({length:7000},(_,i)=>({id:i+1,media_type:'movie',title:'x'.repeat(190),poster_path:'/'.concat('p'.repeat(190))}))};
 await assert.rejects(preparePerson({command:db.command,id:1813,load:async()=>huge,allowWrites:true}),/exceeds safe size/);
 assert.equal(db.values.has(keyFor(1813)),false);
});
test('oversized refresh retains prior record and timestamp',async()=>{
 const db=fakeRedis();
 await preparePerson({command:db.command,id:1813,load:async()=>sample,now:()=>Date.parse('2026-01-01T00:00:00Z'),allowWrites:true});
 const prior=db.values.get(keyFor(1813));
 const huge={...sample,cast:Array.from({length:7000},(_,i)=>({id:i+1,media_type:'movie',title:'x'.repeat(190),poster_path:'/'.concat('p'.repeat(190))}))};
 const result=await preparePerson({command:db.command,id:1813,load:async()=>huge,now:()=>Date.parse('2026-03-02T00:00:00Z'),allowWrites:true});
 assert.equal(result.source,'stale-cache');
 assert.equal(db.values.get(keyFor(1813)),prior);
});

test('incomplete upstream credits do not erase previously saved filmography',async()=>{
 const db=fakeRedis();const first=()=>Date.parse('2026-01-01T00:00:00Z');
 await preparePerson({command:db.command,id:1813,load:async()=>sample,now:first,allowWrites:true});
 const prior=db.values.get(keyFor(1813));
 const partial={...sample};delete partial.cast;
 const result=await preparePerson({command:db.command,id:1813,load:async()=>partial,now:()=>Date.parse('2026-03-02T00:00:00Z'),allowWrites:true});
 assert.equal(result.source,'stale-cache');
 assert.equal(db.values.get(keyFor(1813)),prior);
});
test('unexpected empty filmography cannot overwrite populated credits',async()=>{
 const db=fakeRedis();
 await preparePerson({command:db.command,id:1813,load:async()=>sample,now:()=>Date.parse('2026-01-01T00:00:00Z'),allowWrites:true});
 const prior=db.values.get(keyFor(1813));
 const result=await preparePerson({command:db.command,id:1813,load:async()=>({...sample,cast:[]}),now:()=>Date.parse('2026-03-02T00:00:00Z'),allowWrites:true});
 assert.equal(result.source,'stale-cache');
 assert.equal(db.values.get(keyFor(1813)),prior);
});
