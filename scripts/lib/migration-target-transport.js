'use strict';
const tls=require('node:tls');
const {createClient,RESP_TYPES}=require('redis');
const READ=new Set(['SELECT','INFO','TIME','SCAN','DUMP','TYPE','PEXPIRETIME','GET','MEMORY','DBSIZE','EXISTS']);
// Remote accepts Aiven native TLS only, never a URL, HTTP proxy or upstream REST endpoint.
async function open({host,port,username,password,ca,socketPath,allowRestore=false,timeoutMs=8000},factory=createClient){
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000)throw Error('TRANSPORT_CONFIG');
 let socket;
 if(socketPath){if(typeof socketPath!=='string'||!require('node:path').isAbsolute(socketPath))throw Error('TRANSPORT_CONFIG');socket={path:socketPath};}
 else {
  if(typeof host!=='string'||host.length>253||!/^[a-zA-Z0-9.-]+\.aivencloud\.com$/.test(host)||!Number.isInteger(port)||port<1||port>65535||!username||!password)throw Error('AIVEN_HOST_REQUIRED');
  socket={host,port,tls:true,rejectUnauthorized:true,servername:host,checkServerIdentity:(_n,c)=>tls.checkServerIdentity(host,c),...(ca?{ca}:{})};
 }
 const client=factory({username,password,socket:{...socket,reconnectStrategy:false,connectTimeout:timeoutMs},RESP:2,disableClientInfo:true,disableOfflineQueue:true,commandsQueueMaxLength:1});
 client.on('error',()=>{});let closed=false;
 const close=()=>{closed=true;if(client.isOpen)client.destroy()};
 async function deadline(action){let timer;try{return await Promise.race([action(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('TIMEOUT')),timeoutMs)})])}catch{close();throw Error('TARGET_IO_STOP_NO_RETRY')}finally{clearTimeout(timer)}}
 try{await deadline(()=>client.connect())}catch(e){close();throw e}
 const command=async args=>{
  if(closed||!Array.isArray(args)||!READ.has(args[0])&&!(allowRestore&&args[0]==='RESTORE'))throw Error('COMMAND_FORBIDDEN');
  // Fixed caller only; defense in depth against overwrite/delete or policy changes.
  if(args[0]==='RESTORE'&&(args.length!==4&&!(args.length===5&&args[4]==='ABSTTL')))throw Error('COMMAND_FORBIDDEN');
  const result=await deadline(()=>client.sendCommand(args.map(x=>Buffer.isBuffer(x)?x:String(x)),{typeMapping:{[RESP_TYPES.BLOB_STRING]:Buffer},abortSignal:AbortSignal.timeout(timeoutMs)}));
  return result;
 };
 return {command,async pipeline(batch){const replies=[];for(const args of batch)replies.push(await command(args));return replies},close};
}
module.exports={open};
