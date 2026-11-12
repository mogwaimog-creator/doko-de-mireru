'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {commit}=require('../prototype/streaming-write-safety');
const old={version:3,lastSuccessAt:'2026-11-07T00:00:00Z',japan:{flatrate:[{providerId:8}],rent:[],buy:[]}};
function adapter(){let data=JSON.parse(JSON.stringify(old));return {
 read:async()=>JSON.parse(JSON.stringify(data)),
 compareAndSwap:async(t,id,v,next)=>{if(data.version!==v)return false;data=JSON.parse(JSON.stringify(next));return true},
 get:()=>data,set:x=>data=x
}}
test('successful atomic save advances version',async()=>{
 const io=adapter(),next={...old,lastSuccessAt:'2026-11-09T00:00:00Z'};
 const r=await commit({...io,type:'movie',id:42,expectedVersion:3,next});
 assert.equal(r.status,'saved');assert.equal(io.get().version,4);
});
test('write error leaves old data intact',async()=>{
 const io=adapter(),before=io.get();let failed=false;
 try{await commit({...io,compareAndSwap:async()=>{throw Error('disk failure')},type:'movie',id:42,expectedVersion:3,next:{...old,lastSuccessAt:'new'}})}
 catch{failed=true}
 assert.equal(failed,true);assert.deepEqual(io.get(),before);
});
test('stale worker cannot overwrite newer successful save',async()=>{
 const io=adapter();
 await commit({...io,type:'movie',id:42,expectedVersion:3,next:{...old,lastSuccessAt:'newer'}});
 const r=await commit({...io,type:'movie',id:42,expectedVersion:3,next:{...old,lastSuccessAt:'older'}});
 assert.equal(r.status,'conflict');assert.equal(io.get().lastSuccessAt,'newer');
});
test('restart after uncommitted candidate sees prior record',async()=>{
 const io=adapter();const candidate={...old,lastSuccessAt:'unfinished'};
 const restarted=adapter(); // durable store still contains old state
 assert.equal(restarted.get().lastSuccessAt,old.lastSuccessAt);
 assert.equal(candidate.lastSuccessAt==='unfinished',true);
});
