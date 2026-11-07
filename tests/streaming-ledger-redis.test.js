'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {redisStreamingStore}=require('../prototype/streaming-ledger-redis');
function fakeRedis(){
 const data=new Map(),calls=[];
 async function command(args){calls.push(args);const [op,...rest]=args;
  if(op==='SET'){const [key,value,...options]=rest;if(options.includes('NX')&&data.has(key))return null;data.set(key,value);return 'OK'}
  if(op==='GET')return data.get(rest[0])??null;
  if(op==='EVAL'){const [script,count,...params]=rest;
   if(Number(count)===1){const [key,token]=params;if(data.get(key)!==token)return 0;data.delete(key);return 1}
   const [lock,key,token,payload]=params;if(data.get(lock)!==token)return 0;data.set(key,payload);return 1;
  }throw Error('unexpected '+op)
 }return {command,data,calls};
}
test('owner saves one complete record atomically',async()=>{
 const f=fakeRedis(),s=redisStreamingStore(f.command);
 assert.equal(await s.acquire('movie:1','a',30000),true);
 assert.equal(await s.saveIfOwner('movie:1','a',{japan:{flatrate:[]}}),true);
 assert.deepEqual(await s.read('movie:1'),{japan:{flatrate:[]}});
 assert.equal(f.calls.filter(c=>c[0]==='EVAL'&&c[2]==='2').length,1);
});
test('old owner cannot overwrite or unlock new owner',async()=>{
 const f=fakeRedis(),s=redisStreamingStore(f.command);
 await s.acquire('tv:2','new',30000);await s.saveIfOwner('tv:2','new',{version:2});
 assert.equal(await s.saveIfOwner('tv:2','old',{version:1}),false);
 assert.equal(await s.release('tv:2','old'),false);
 assert.equal((await s.read('tv:2')).version,2);
});
test('second worker cannot acquire active lease',async()=>{
 const f=fakeRedis(),s=redisStreamingStore(f.command);
 assert.equal(await s.acquire('movie:3','a',30000),true);
 assert.equal(await s.acquire('movie:3','b',30000),false);
 assert.equal(await s.release('movie:3','a'),true);
 assert.equal(await s.acquire('movie:3','b',30000),true);
});
