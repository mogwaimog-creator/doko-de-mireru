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

test('Aiven v2 adapter writes streaming payload and reads identical bytes back',async()=>{
 const records=new Map(),sent=[],events=[];
 const createClient=options=>({isOpen:false,on(){return this},async connect(){this.isOpen=true},async sendCommand(args){sent.push(args);if(args[0]==='SET'){records.set(args[1],args[2]);return 'OK'}if(args[0]==='GET')return records.get(args[1])??null;throw Error('unexpected command')},destroy(){this.isOpen=false}});
 const connection=createAivenConnection(env,{createClient,emit:(...a)=>events.push(a.join(' '))});
 const key='doko:ledger:test:shared-stream:v1:record:movie:157336';
 const payload=JSON.stringify({type:'movie',id:157336,watch:{flatrate:[{provider_id:9}]},lastSuccessAt:'2026-11-18T00:00:00.000Z'});
 const write=await connection.request('https://valkey.invalid',{method:'POST',body:JSON.stringify(['SET',key,payload])});
 assert.equal((await write.json()).result,'OK');
 const read=await connection.request('https://valkey.invalid',{method:'POST',body:JSON.stringify(['GET',key])});
 assert.equal((await read.json()).result,payload);
 assert.deepEqual(sent.map(a=>a[0]),['SET','GET']);
 assert.ok(events.some(e=>e.includes('"stage":"save"')&&e.includes('"ok":true')));
 assert.ok(events.some(e=>e.includes('"stage":"read"')&&e.includes('"ok":true')));
 connection.close();
});

test('Aiven v2 integrates with release key isolation and preserves streaming record bytes',async()=>{
 const {createTransport}=require('../api/_release-transport-candidate');
 const store=new Map(),wire=[],events=[];
 const createClient=()=>({isOpen:false,on(){return this},async connect(){this.isOpen=true},
  async sendCommand(args){wire.push(args);if(args[0]==='SET'){store.set(args[1],args[2]);return 'OK'}if(args[0]==='GET')return store.get(args[1])??null;throw Error('unexpected operation')},
  destroy(){this.isOpen=false}});
 const connection=createAivenConnection(env,{createClient,emit:(...parts)=>events.push(parts.join(' '))});
 const sha='a'.repeat(64);
 const release=createTransport({endpoint:'https://valkey.invalid',token:'internal-valkey-transport-token',
  releaseSha256:sha,phase:'new',enabled:true,request:connection.request,scripts:[],maxRequests:8,maxReservedCommands:8});
 const logical='doko:dev:shared-stream:v1:record:movie:157336';
 const payload=JSON.stringify({type:'movie',id:157336,watch:{flatrate:[{provider_id:9}]}});
 assert.equal(await release.command(['SET',logical,payload]),'OK');
 assert.equal(await release.command(['GET',logical]),payload);
 assert.equal(wire[0][1],'doko:ledger:release:'+sha.slice(0,16)+':shared-stream:v1:record:movie:157336');
 assert.equal(wire[1][1],wire[0][1]);
 assert.ok(events.some(line=>line.includes('"stage":"save"')));
 await assert.rejects(release.command(['SET','not-a-logical-key',payload]),/canonical logical key/);
 connection.close();
});
