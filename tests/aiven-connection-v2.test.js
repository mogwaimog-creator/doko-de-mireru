'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAivenConnection}=require('../api/_aiven-connection-v2');
const env={REDIS_PROVIDER:'valkey',AIVEN_REDIS_URL:'valkeys://user:secret@example.aivencloud.com:12345'};
function fake({connectFails=false,sendFails=false}={}){
 const calls=[];let instance;
 const createClient=options=>{calls.push(options);instance={
  isOpen:false,on(){return this},async connect(){if(connectFails)throw Error('private connection error');this.isOpen=true},
  async sendCommand(args){calls.push(args);if(sendFails)throw Error('private Redis error');return args[0]==='PING'?'PONG':'OK'},
  destroy(){this.isOpen=false}
 };return instance};
 return {createClient,calls};
}
test('Aiven v2 rejects missing TLS and non-Aiven provider',()=>{
 assert.throws(()=>createAivenConnection({REDIS_PROVIDER:'upstash',AIVEN_REDIS_URL:env.AIVEN_REDIS_URL}),/explicit valkey/);
 assert.throws(()=>createAivenConnection({...env,AIVEN_REDIS_URL:'redis://example.com:12345'}),/TLS/);
});
test('Aiven v2 probes TLS, executes command, and never logs credentials',async()=>{
 const f=fake(),logs=[],connection=createAivenConnection(env,{createClient:f.createClient,emit:(...args)=>logs.push(args.join(' '))});
 assert.equal((await connection.probe()).ok,true);
 assert.equal(await connection.command(['GET','test']), 'OK');
 assert.equal(f.calls[0].socket.tls,true);
 assert.equal(f.calls[0].socket.reconnectStrategy,false);
 assert.equal(f.calls[0].disableOfflineQueue,true);
 assert.equal(logs.join(' ').includes('secret'),false);
 connection.close();
});
test('Aiven v2 fails closed on connection error without replay',async()=>{
 const f=fake({connectFails:true}),connection=createAivenConnection(env,{createClient:f.createClient,emit:()=>{}});
 await assert.rejects(connection.command(['SET','key','value']),/connection failed/);
 assert.equal(f.calls.filter(x=>Array.isArray(x)).length,0);
});
test('Aiven v2 never retries command with unknown outcome',async()=>{
 const f=fake({sendFails:true}),connection=createAivenConnection(env,{createClient:f.createClient,emit:()=>{}});
 await assert.rejects(connection.command(['SET','key','value']),/outcome may be unknown/);
 assert.equal(f.calls.filter(x=>Array.isArray(x)).length,1);
});
test('Aiven v2 request adapter preserves release transport response contract',async()=>{
 const f=fake(),connection=createAivenConnection(env,{createClient:f.createClient,emit:()=>{}});
 const response=await connection.request('https://valkey.invalid',{method:'POST',body:JSON.stringify(['PING'])});
 assert.deepEqual(await response.json(),{result:'PONG'});
});
