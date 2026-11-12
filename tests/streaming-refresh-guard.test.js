'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createGuard}=require('../prototype/streaming-refresh-guard');
const at='2026-11-09T00:00:00Z';
test('concurrent requests for same work share one refresh',async()=>{
 const guard=createGuard();let calls=0,release;
 const gate=new Promise(resolve=>release=resolve);
 const refresh=async()=>{calls++;await gate;return 'ok'};
 const args={type:'movie',id:42,record:{lastSuccessAt:null},at,refresh};
 const a=guard.run(args),b=guard.run(args),c=guard.run(args);
 assert.equal(calls,1);assert.equal(guard.pending(),1);
 release();
 const values=await Promise.all([a,b,c]);
 assert.deepEqual(values,[{status:'updated',value:'ok'},{status:'updated',value:'ok'},{status:'updated',value:'ok'}]);
 assert.equal(guard.pending(),0);
});
test('movie and tv with identical numeric ID have separate locks',async()=>{
 const guard=createGuard();let calls=0;
 await Promise.all(['movie','tv'].map(type=>guard.run({type,id:42,record:{},at,refresh:async()=>++calls})));
 assert.equal(calls,2);
});
test('failed refresh releases lock for a later retry',async()=>{
 const guard=createGuard();
 const a=await guard.run({type:'movie',id:42,record:{},at,refresh:async()=>{throw Error('timeout')}});
 assert.equal(a.status,'failed');assert.equal(guard.pending(),0);
 const b=await guard.run({type:'movie',id:42,record:{},at,refresh:async()=>1});
 assert.equal(b.status,'updated');
});
test('not due does not invoke refresh',async()=>{
 const guard=createGuard();let calls=0;
 const out=await guard.run({type:'movie',id:42,record:{lastSuccessAt:'2026-11-08T23:00:00Z'},at,refresh:async()=>++calls});
 assert.equal(out.status,'skipped');assert.equal(calls,0);
});
