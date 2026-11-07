'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {lease,memoryAdapter}=require('../prototype/streaming-ledger-lease');
test('two independent workers share one atomic lease',async()=>{
 const adapter=memoryAdapter(),a=lease(adapter),b=lease(adapter);let finish;const pending=new Promise(r=>finish=r);
 const first=a.run('movie:1',async()=>{await pending;return 1});
 const second=await b.run('movie:1',async()=>2);
 assert.deepEqual(second,{acquired:false});finish();assert.deepEqual(await first,{acquired:true,value:1});
 assert.deepEqual(await b.run('movie:1',async()=>3),{acquired:true,value:3});
});
test('release must not delete a lock owned by another token',async()=>{
 const adapter=memoryAdapter();assert.equal(await adapter.acquire('movie:1','owner-A',1000),true);
 assert.equal(await adapter.release('movie:1','owner-B'),false);
 assert.equal(await adapter.acquire('movie:1','owner-C',1000),false);
 assert.equal(await adapter.release('movie:1','owner-A'),true);
});
test('failed task releases its lease',async()=>{
 const adapter=memoryAdapter(),l=lease(adapter);
 await assert.rejects(()=>l.run('tv:7',async()=>{throw Error('failed')}),/failed/);
 assert.deepEqual(await l.run('tv:7',async()=>true),{acquired:true,value:true});
});
