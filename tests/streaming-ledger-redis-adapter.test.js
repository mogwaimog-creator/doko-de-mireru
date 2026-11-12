'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');const {redisLeaseAdapter}=require('../prototype/streaming-ledger-redis-adapter');
function fakeRedis(){
 const db=new Map(),calls=[];return {calls,db,async command(args){calls.push(args);const [op,...a]=args;
 if(op==='SET'){if(a.includes('NX')&&db.has(a[0]))return null;db.set(a[0],a[1]);return 'OK'}
 if(op==='GET')return db.get(a[0])??null;
 if(op==='EVAL'){const [script,count,...rest]=a;const keys=rest.slice(0,Number(count)),argv=rest.slice(Number(count));
 if(Number(count)===1){if(db.get(keys[0])!==argv[0])return 0;db.delete(keys[0]);return 1}
 if(db.get(keys[0])!==argv[0])return 0;db.set(keys[1],argv[1]);return 1}
 throw Error('unsupported '+op)}}}
test('atomic owner-checked commit stores one record only',async()=>{
 const f=fakeRedis(),a=redisLeaseAdapter(f.command);assert.equal(await a.acquire('movie:1','A',30000),true);
 assert.equal(await a.commitRecordIfOwner('movie:1','B',{v:'wrong'}),false);
 assert.equal(await a.read('movie:1'),null);
 assert.equal(await a.commitRecordIfOwner('movie:1','A',{v:'correct'}),true);
 assert.deepEqual(await a.read('movie:1'),{v:'correct'});
 assert.equal(f.calls.filter(c=>c[0]==='EVAL'&&c[2]==='2').length,2);
});
test('old owner cannot remove replacement lock or overwrite newer record',async()=>{
 const f=fakeRedis(),a=redisLeaseAdapter(f.command);
 await a.acquire('tv:7','A',30000);f.db.set(a.keys.lockKey('tv:7'),'B');
 assert.equal(await a.commitRecordIfOwner('tv:7','A',{v:'stale'}),false);
 assert.equal(await a.release('tv:7','A'),false);
 assert.equal(await a.commitRecordIfOwner('tv:7','B',{v:'fresh'}),true);
 assert.deepEqual(await a.read('tv:7'),{v:'fresh'});
});
test('writes-disabled mode does not acquire or save',async()=>{
 const f=fakeRedis();let enabled=false;const a=redisLeaseAdapter(f.command,{writesEnabled:()=>enabled});
 assert.equal(await a.acquire('movie:1','A',1000),false);assert.equal(f.calls.length,0);
 enabled=true;await a.acquire('movie:1','A',1000);enabled=false;
 assert.equal(await a.commitRecordIfOwner('movie:1','A',{v:1}),false);
 assert.equal(await a.read('movie:1'),null);
});
