'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {redisStreamingStore}=require('../prototype/streaming-ledger-redis');
function mockCommand(){
 const data=new Map(), calls=[];
 const command=async args=>{
  calls.push(args);const [op,...a]=args;
  if(op==='GET')return data.get(a[0])??null;
  if(op==='SET'){
   if(a.includes('NX')&&data.has(a[0]))return null;
   data.set(a[0],a[1]);return 'OK';
  }
  if(op==='EVAL'){
   const [script,count,...params]=a;
   if(count==='1'){if(data.get(params[0])!==params[1])return 0;data.delete(params[0]);return 1}
   if(count==='2'){if(data.get(params[0])!==params[2])return 0;data.set(params[1],params[3]);return 1}
   throw Error('invalid EVAL arity');
  }
  throw Error('unsupported '+op);
 };
 return {command,calls};
}
test('adapter uses Upstash REST command arrays with isolated prototype keys',async()=>{
 const m=mockCommand(),db=redisStreamingStore(m.command);
 assert.equal(await db.acquire('movie:123','owner-a',30000),true);
 assert.equal(await db.acquire('movie:123','owner-b',30000),false);
 assert.deepEqual(m.calls[0],['SET','doko:stream:prototype:v1:lock:movie:123','owner-a','NX','PX','30000']);
 assert.equal(m.calls.some(c=>c[0]==='EVAL'&&c[2]==='2'),false);
});
test('only lease owner can save; stale owner cannot overwrite newer data',async()=>{
 const m=mockCommand(),db=redisStreamingStore(m.command);
 await db.acquire('tv:2','a',30000);
 assert.equal(await db.saveIfOwner('tv:2','b',{value:0}),false);
 assert.equal(await db.saveIfOwner('tv:2','a',{value:1}),true);
 assert.deepEqual(await db.read('tv:2'),{value:1});
 assert.equal(await db.release('tv:2','b'),false);
 assert.equal(await db.release('tv:2','a'),true);
 await db.acquire('tv:2','c',30000);
 assert.equal(await db.saveIfOwner('tv:2','a',{value:9}),false);
 assert.equal(await db.saveIfOwner('tv:2','c',{value:2}),true);
 assert.deepEqual(await db.read('tv:2'),{value:2});
});
test('read-only path never mutates data and no Redis connection occurs on import',async()=>{
 const m=mockCommand(),db=redisStreamingStore(m.command);
 assert.equal(m.calls.length,0);
 assert.equal(await db.read('movie:1'),null);
 assert.equal(m.calls.length,1);
 assert.equal(m.calls[0][0],'GET');
});
