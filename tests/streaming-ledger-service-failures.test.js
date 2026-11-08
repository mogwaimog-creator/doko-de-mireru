'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {service}=require('../prototype/streaming-ledger-service');
function memory(){
 const rows=new Map(),locks=new Map();
 return {read:async k=>rows.get(k)||null,acquire:async(k,t)=>locks.has(k)?false:(locks.set(k,t),true),
 release:async(k,t)=>locks.get(k)===t?(locks.delete(k),true):false,
 saveIfOwner:async(k,t,r)=>locks.get(k)===t?(rows.set(k,JSON.parse(JSON.stringify(r))),true):false,
 expire:k=>locks.delete(k)};
}
const payload={results:{JP:{flatrate:[{provider_id:8,provider_name:'Example'}]}}};
test('first failure is saved without claiming successful empty data',async()=>{
 const db=memory(),s=service(db,async()=>{throw Error('timeout')});
 const r=await s.visit('movie',1,'2026-11-08T00:00:00Z',[]);
 assert.equal(r.errorRecorded,true);
 const saved=await db.read('movie:1');assert.equal(saved.lastSuccessAt,null);assert.equal(saved.errors.length,1);
});
test('repeated failures aggregate, later success resolves',async()=>{
 const db=memory();let failed=true;
 const s=service(db,async()=>{if(failed)throw Error('timeout');return payload});
 await s.visit('movie',2,'2026-11-06T00:00:00Z',[]);
 await s.visit('movie',2,'2026-11-07T00:00:00Z',[]);
 assert.equal((await db.read('movie:2')).errors[0].count,2);
 failed=false;await s.visit('movie',2,'2026-11-08T00:00:00Z',[]);
 assert.equal((await db.read('movie:2')).errors[0].status,'resolved');
});
test('refresh failure preserves cached provider and success timestamp',async()=>{
 const db=memory();let failed=false;const s=service(db,async()=>{if(failed)throw Error('timeout');return payload});
 const first=await s.visit('tv',3,'2026-11-05T00:00:00Z',[]);
 failed=true;await s.visit('tv',3,'2026-11-07T00:00:00Z',[]);
 const saved=await db.read('tv:3');assert.equal(saved.japan.flatrate[0].providerId,8);assert.equal(saved.lastSuccessAt,first.record.lastSuccessAt);
});
test('writes disabled prevents fetch and failure persistence',async()=>{
 const db=memory();let calls=0;const s=service(db,async()=>{calls++;throw Error('timeout')},{writesEnabled:()=>false});
 assert.equal((await s.visit('movie',4,'2026-11-08T00:00:00Z',[])).reason,'writes-disabled');
 assert.equal(await db.read('movie:4'),null);assert.equal(calls,0);
});
test('expired lease prevents stale failure persistence',async()=>{
 const db=memory();const s=service(db,async()=>{db.expire('movie:5');throw Error('timeout')});
 const r=await s.visit('movie',5,'2026-11-08T00:00:00Z',[]);
 assert.equal(r.errorRecorded,false);assert.equal(await db.read('movie:5'),null);
});
