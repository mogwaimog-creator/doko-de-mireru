'use strict';
// Independent Aiven connection v2. Opt-in only; never touches Upstash.
// The existing release transport still enforces key isolation, Lua allowlisting and budgets.
const {createClient:defaultCreateClient}=require('redis');
const TIMEOUT_MS=8000;
function safeStage(stage,ok,code='ok',emit=console.info){
 emit('AIVEN_CONNECTION_V2',JSON.stringify({stage,ok,code,at:new Date().toISOString()}));
}
function createAivenConnection(env=process.env,{createClient=defaultCreateClient,emit=console.info}={}){
 if(env.REDIS_PROVIDER!=='valkey')throw Error('Aiven v2 requires explicit valkey provider');
 const raw=env.AIVEN_REDIS_URL;
 if(!raw)throw Error('Aiven v2 URL missing');
 const url=new URL(raw.startsWith('valkeys://')?'rediss://'+raw.slice('valkeys://'.length):raw);
 if(url.protocol!=='rediss:'||!url.hostname||!url.port||!['','/'].includes(url.pathname)||url.search||url.hash)throw Error('Aiven v2 requires explicit TLS endpoint');
 const fingerprint=[url.hostname,url.port].join(':'); // no credentials in diagnostics
 let client=null,opening=null;
 async function open(){
  if(client?.isOpen)return client;
  if(opening)return opening;
  safeStage('connect-start',true,'started',emit);
  if(client){try{client.destroy()}catch{}}
  client=createClient({url:url.toString(),disableOfflineQueue:true,commandsQueueMaxLength:128,
   socket:{tls:true,connectTimeout:TIMEOUT_MS,reconnectStrategy:false,...(env.REDIS_CA_CERT?{ca:env.REDIS_CA_CERT}:{})}});
  client.on('error',()=>{}); // errors surfaced through connect/sendCommand
  const candidate=client;
  opening=(async()=>{try{await candidate.connect();safeStage('connect',true,'ok',emit);return candidate}
   catch{safeStage('connect',false,'connection-failed',emit);try{candidate.destroy()}catch{};throw Error('Aiven v2 connection failed')}})();
  try{return await opening}finally{opening=null}
 }
 async function command(args){
  if(!Array.isArray(args)||args.length===0||args.some(x=>typeof x!=='string'&&typeof x!=='number'))throw Error('Aiven v2 invalid command');
  const op=String(args[0]).toUpperCase(),stage=['GET','MGET','PING','EXISTS','TYPE','TIME','HGET','HGETALL','ZRANGE','ZCARD'].includes(op)?'read':['SET','MSET','EVAL','HSET','ZADD','INCR','EXPIRE','PEXPIRE'].includes(op)?'save':'command';
  const c=await open();
  try{
   const result=await c.sendCommand(args.map(String),{abortSignal:AbortSignal.timeout(TIMEOUT_MS)});
   safeStage(stage,true,'ok',emit);return result;
  }catch{
   safeStage(stage,false,'command-outcome-unknown',emit);
   // Never retry writes: a lost response does not prove the command was not committed.
   try{c.destroy()}catch{}
   throw Error('Aiven v2 command failed; outcome may be unknown');
  }
 }
 async function request(_endpoint,options){
  if(options?.method!=='POST'||typeof options.body!=='string')throw Error('Aiven v2 invalid adapter request');
  const args=JSON.parse(options.body);
  // Return the same bounded streaming Response shape consumed by release transport.
  return new Response(JSON.stringify({result:await command(args)}),{status:200,headers:{'content-type':'application/json'}});
 }
 async function probe(){
  safeStage('probe-start',true,'started',emit);
  const pong=await command(['PING']);
  if(pong!=='PONG'){safeStage('probe',false,'unexpected-ping',emit);throw Error('Aiven v2 unexpected PING response')}
  safeStage('probe',true,'ok',emit);
  return {ok:true,provider:'aiven-valkey-v2',endpoint:fingerprint};
 }
 function close(){if(client){try{client.destroy()}catch{}client=null}}
 return {command,request,probe,close};
}
let shared=null,identity=null;
function sharedAivenConnection(env=process.env){
 const next=JSON.stringify([env.REDIS_PROVIDER,env.AIVEN_REDIS_URL,env.REDIS_CA_CERT]);
 if(shared&&identity!==next)throw Error('Aiven v2 configuration changed; restart required');
 if(!shared){shared=createAivenConnection(env);identity=next}
 return shared;
}
function close(){shared?.close();shared=null;identity=null}
module.exports={createAivenConnection,sharedAivenConnection,close};
