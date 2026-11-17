'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const transport=require('../api/_release-transport-candidate');
function fixture(phase='new',role='application'){
 const calls=[];
 const client=transport.createTransport({
  releaseSha256:randomBytes(32).toString('hex'),phase,role,enabled:true,
  nativeCommand:async args=>{calls.push(args);if(args[0]==='GET')return null;return 'OK'},
  scripts:[],maxRequests:4,maxReservedCommands:4
 });
 return {client,calls};
}
test('native Aiven path maps canonical keys and never invokes HTTP',async()=>{
 const {client,calls}=fixture();
 assert.equal(await client.command(['SET','doko:dev:shared-stream:v1:record:movie:157336','{}']),'OK');
 assert.equal(await client.command(['GET','doko:dev:shared-stream:v1:record:movie:157336']),null);
 assert.equal(calls.length,2);
 assert.match(calls[0][1],/^doko:ledger:release:[a-f0-9]{16}:shared-stream:v1:record:movie:157336$/);
});
test('native Aiven path preserves isolation and write pause',async()=>{
 const {client,calls}=fixture('paused');
 await assert.rejects(client.command(['SET','doko:dev:test:key','x']),/paused/);
 await assert.rejects(client.command(['GET','outside:key']),/canonical/);
 await assert.rejects(client.command(['SCAN','0']),/forbidden/);
 assert.equal(calls.length,0);
 const admin=fixture('paused','administrator');
 assert.equal(await admin.client.command(['SET','doko:dev:test:key','x']),'OK');
});
test('native Aiven path rejects unregistered Lua and enforces command budget',async()=>{
 const {client,calls}=fixture();
 await assert.rejects(client.command(['EVAL','return 1',0]),/unregistered/);
 for(let i=0;i<4;i++)await client.command(['GET','doko:dev:test:key']);
 await assert.rejects(client.command(['GET','doko:dev:test:key']),/budget/);
 assert.equal(calls.length,4);
});
test('native Aiven failures are not replayed',async()=>{
 let calls=0;
 const client=transport.createTransport({releaseSha256:'a'.repeat(64),phase:'new',enabled:true,
 nativeCommand:async()=>{calls++;throw Error('private failure')},scripts:[]});
 await assert.rejects(client.command(['GET','doko:dev:test:key']),/storage unavailable/);
 assert.equal(calls,1);
});
