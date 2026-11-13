'use strict';
// Lazy RESP connection. No fallback to Upstash and no command replay.
function createValkey(env=process.env,{createClient=require('redis').createClient}={}){
 const url=new URL(env.REDIS_URL||'');
 // Aiven now documents valkeys://; node-redis uses rediss:// for the same TLS protocol.
 if(url.protocol==='valkeys:')url.protocol='rediss:';
 const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(url.protocol!=='rediss:'&&!(url.protocol==='redis:'&&local&&env.NODE_ENV!=='production'&&env.VERCEL_ENV!=='production'))throw Error('Valkey requires verified TLS');
 if(url.search||url.hash)throw Error('Redis URL options forbidden');
 let client,opening;
 async function command(args){
  if(!Array.isArray(args)||!args.length||args.some(v=>!['string','number'].includes(typeof v)))throw Error('Invalid Redis arguments');
  if(!client){client=createClient({url:url.toString(),disableOfflineQueue:true,socket:{connectTimeout:8000,reconnectStrategy:false,...(url.protocol==='rediss:'?{tls:true,...(env.REDIS_CA_CERT?{ca:env.REDIS_CA_CERT}:{})}:{})},commandsQueueMaxLength:512});client.on('error',()=>{});}
  try{if(opening)await opening;else if(!client.isOpen){opening=client.connect().finally(()=>{opening=null});await opening}}catch{throw Error('Valkey connection unavailable')}
  try{return await client.sendCommand(args.map(String),{abortSignal:AbortSignal.timeout(8000)})}catch{throw Error('Valkey command failed; outcome may be unknown')}
 }
 return {command,request:async(_url,options)=>new Response(JSON.stringify({result:await command(JSON.parse(options.body))})),close:()=>{if(client?.isOpen)client.destroy()}};
}
let pooled,identity;
function sharedValkey(env=process.env){const next=JSON.stringify([env.REDIS_URL,env.REDIS_CA_CERT,env.NODE_ENV,env.VERCEL_ENV]);if(pooled&&identity!==next)throw Error('Redis configuration changed; restart required');if(!pooled){pooled=createValkey(env);identity=next}return pooled}
function close(){pooled?.close();pooled=undefined;identity=undefined}
module.exports={createValkey,sharedValkey,close};
