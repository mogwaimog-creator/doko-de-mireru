'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createAivenConnection}=require('../api/_aiven-native');
function mock(){
 const calls=[];let connects=0,options;
 const factory=o=>{options=o;return {isOpen:false,on(){},async connect(){connects++;this.isOpen=true},async sendCommand(args){calls.push(args);return args[0]==='GET'?'saved':'OK'},destroy(){this.isOpen=false}}};
 return {factory,calls,get connects(){return connects},get options(){return options}};
}
test('native client uses verified TLS and lazy one-time connection',async()=>{
 const m=mock(),c=createAivenConnection({AIVEN_REDIS_URL:'valkeys://default:encoded%40secret@example.invalid:16890'},m.factory);
 assert.equal(m.connects,0);
 assert.equal(await c.command(['GET','test:key']),'saved');
 assert.equal(await c.command(['SET','test:key','x']),'OK');
 assert.equal(m.connects,1);
 assert.equal(m.options.socket.tls,true);
 assert.equal(m.options.socket.reconnectStrategy,false);
 assert.equal(m.options.disableOfflineQueue,true);
 assert.equal(new URL(m.options.url).protocol,'rediss:');
 c.close();
});
test('native client rejects plaintext, URL options and invalid commands',async()=>{
 const m=mock();
 for(const url of ['redis://host.invalid:6379','valkey://host.invalid:6379','rediss://host.invalid:16890?rejectUnauthorized=false']){
  assert.throws(()=>createAivenConnection({AIVEN_REDIS_URL:url},m.factory));
 }
 const c=createAivenConnection({AIVEN_REDIS_URL:'rediss://host.invalid:16890'},m.factory);
 await assert.rejects(c.command([]),/Invalid/);
 await assert.rejects(c.command(['GET',{}]),/Invalid/);
 assert.equal(m.connects,0);
});
test('native client only permits temporary writes through writeTest helper',async()=>{
 const m=mock(),c=createAivenConnection({AIVEN_REDIS_URL:'rediss://host.invalid:16890'},m.factory);
 await assert.rejects(c.writeTest('doko:dev:work:v2:movie:1','x'),/temporary/);
 await assert.rejects(c.writeTest('chatgpt:connection-test:one','x',301),/temporary/);
 assert.equal(await c.writeTest('chatgpt:connection-test:one','x',60),'OK');
 assert.deepEqual(m.calls[0],['SET','chatgpt:connection-test:one','x','NX','EX','60']);
 c.close();
});
