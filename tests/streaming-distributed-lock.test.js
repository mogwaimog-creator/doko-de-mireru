'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createDistributedLock,lockKey}=require('../prototype/streaming-distributed-lock');
function mock(){
 const locks=new Map();
 return {locks,
 acquireAtomic:async(key,token)=>{if(locks.has(key))return false;locks.set(key,token);return true},
 releaseIfOwner:async(key,token)=>{if(locks.get(key)===token){locks.delete(key);return true}return false}};
}
test('two independent workers cannot both refresh same work',async()=>{
 const io=mock(),a=createDistributedLock(io),b=createDistributedLock(io);
 let release,calls=0;const gate=new Promise(r=>release=r);
 const args={type:'movie',id:42,refresh:async()=>{calls++;await gate;return 'ok'}};
 const first=a.run({...args,token:'worker-a-unique-token'});
 const second=await b.run({...args,token:'worker-b-unique-token'});
 assert.equal(second.status,'busy');assert.equal(calls,1);
 release();assert.equal((await first).status,'updated');
 assert.equal(io.locks.size,0);
});
test('release cannot remove a lock now owned by another worker',async()=>{
 const io=mock(),lock=createDistributedLock(io);
 const k=lockKey('movie',42);
 const out=await lock.run({type:'movie',id:42,token:'worker-a-unique-token',refresh:async()=>{
  io.locks.set(k,'worker-b-unique-token');return 'ok';
 }});
 assert.equal(out.status,'updated');
 assert.equal(io.locks.get(k),'worker-b-unique-token');
});
test('failure releases owned lock',async()=>{
 const io=mock(),lock=createDistributedLock(io);
 let failed=false;
 try{await lock.run({type:'tv',id:42,token:'worker-a-unique-token',refresh:async()=>{throw Error('failed')}})}
 catch{failed=true}
 assert.equal(failed,true);assert.equal(io.locks.size,0);
});
test('movie and tv identities use distinct lock keys',()=>{
 assert.equal(lockKey('movie',42)===lockKey('tv',42),false);
});
