'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {service}=require('../prototype/streaming-ledger-service');
const {store}=require('../prototype/streaming-ledger');
function memory(){
 const records=new Map(),leases=new Map();
 return {
  read:async k=>records.has(k)?JSON.parse(JSON.stringify(records.get(k))):null,
  acquire:async(k,t)=>leases.has(k)?false:(leases.set(k,t),true),
  release:async(k,t)=>leases.get(k)===t?(leases.delete(k),true):false,
  saveIfOwner:async(k,t,r)=>leases.get(k)===t?(records.set(k,JSON.parse(JSON.stringify(r))),true):false,
  expire:k=>leases.delete(k)
 };
}
const payload={results:{JP:{flatrate:[{provider_id:8,provider_name:'Example'}]}}};
test('simultaneous first visits fetch once; second visitor sees in-flight',async()=>{
 const db=memory();let calls=0,finish;
 const pending=new Promise(resolve=>finish=resolve);
 const s=service(db,async()=>{calls++;await pending;return payload});
 const a=s.visit('movie',101,'2026-11-08T00:00:00Z',[]);
 // Wait until the first fetcher has started and holds the lease.
 while(calls===0)await Promise.resolve();
 const b=await s.visit('movie',101,'2026-11-08T00:00:00Z',[]);
 assert.equal(b.reason,'in-flight');assert.equal(b.record,null);
 finish();assert.equal((await a).updated,true);assert.equal(calls,1);
 assert.equal((await s.visit('movie',101,'2026-11-08T00:01:00Z',[])).reason,'cached');
});
test('simultaneous stale visits retain old data while refreshing',async()=>{
 const db=memory();let calls=0,finish;
 const s=service(db,async()=>{calls++;if(calls===1)return payload;return new Promise(resolve=>finish=()=>resolve(payload))});
 const first=await s.visit('tv',102,'2026-11-06T00:00:00Z',[]);
 const pending=s.visit('tv',102,'2026-11-08T00:00:00Z',[]);
 while(calls<2)await Promise.resolve();
 const second=await s.visit('tv',102,'2026-11-08T00:00:00Z',[]);
 assert.equal(second.reason,'in-flight');assert.equal(second.record.lastSuccessAt,first.record.lastSuccessAt);
 finish();assert.equal((await pending).updated,true);assert.equal(calls,2);
});
test('save/load preserves cooldown and shared provider data',()=>{
 const a=store();a.register('movie',103);
 a.success('movie',103,{JP:{flatrate:[{providerId:8,name:'Example'}]}},'2026-11-06T00:00:00Z');
 a.failure('movie',103,'timeout','2026-11-08T00:00:00Z');
 const b=store();b.load(a.save());
 assert.deepEqual(b.get('movie',103).japan,a.get('movie',103).japan);
 assert.equal(b.get('movie',103).lastAttemptAt,'2026-11-08T00:00:00.000Z');
 assert.equal(b.get('movie',103).errors[0].status,'open');
});
test('expired lease rejects late success from previous owner',async()=>{
 const db=memory();let finish,calls=0;
 const s=service(db,async()=>{calls++;if(calls===1)return new Promise(resolve=>finish=()=>resolve(payload));return payload});
 const slow=s.visit('movie',104,'2026-11-08T00:00:00Z',[]);
 while(calls===0)await Promise.resolve();
 db.expire('movie:104');
 const fast=await s.visit('movie',104,'2026-11-08T00:00:00Z',[]);
 assert.equal(fast.updated,true);
 finish();const old=await slow;
 assert.equal(old.reason,'lease-expired');
 assert.equal((await db.read('movie:104')).lastSuccessAt,fast.record.lastSuccessAt);
 assert.equal(calls,2);
});
