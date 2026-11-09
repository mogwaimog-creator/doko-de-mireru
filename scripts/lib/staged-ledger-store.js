'use strict';
// New owned namespace only. No legacy reads, SCAN, KEYS, FLUSH*, or standalone DEL.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const transport=require('../../api/_release-transport-candidate');
const MAX_COMMANDS=40000,MAX_OWNED_BYTES=8*1024*1024,MAX_DATABASE_BYTES=240000000;
function stateFile(dir,target){return path.join(dir,'ledger-'+target+'.json')}
function openState(dir,target){if(!['local','upstash'].includes(target))throw Error('explicit storage target required');const file=stateFile(dir,target);let s;if(fs.existsSync(file))s=JSON.parse(fs.readFileSync(file,'utf8'));else{s={version:1,target,sha:crypto.randomBytes(32).toString('hex'),initialized:false,reservedCommands:0,requests:0,sizes:{},saved:[],batches:[]};saveState(dir,s)}if(s.version!==1||s.target!==target||!/^[a-f0-9]{64}$/.test(s.sha))throw Error('invalid owned namespace state');return s}
function saveState(dir,s){const dest=stateFile(dir,s.target),tmp=dest+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,dest)}
function acquireLock(dir,target){if(!['local','upstash'].includes(target))throw Error('explicit storage target required');const file=path.join(dir,'active-'+target+'.lock');if(fs.existsSync(file)){const pid=Number(fs.readFileSync(file,'utf8'));try{process.kill(pid,0)}catch(e){if(e.code==='ESRCH')fs.unlinkSync(file);else throw e}if(fs.existsSync(file))throw Error('another registration/verification process owns this target')}
 fs.writeFileSync(file,String(process.pid),{flag:'wx',mode:0o600});const release=()=>{if(fs.existsSync(file)&&fs.readFileSync(file,'utf8')===String(process.pid))fs.unlinkSync(file)};process.once('exit',release);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>process.exit(signal==='SIGINT'?130:143));return release;}
function infoNumbers(raw){if(typeof raw!=='string')throw Error('INFO metrics unavailable');if(raw.startsWith('"'))raw=JSON.parse(raw);const out={};for(const line of raw.split(/\r?\n/)){const m=line.match(/^([a-z_]+):(\d+(?:\.\d+)?)$/);if(m)out[m[1]]=Number(m[2])}return out}
function storage(dir,target,{request=fetch,env=process.env,localCommand}={}){
 const state=openState(dir,target),prefix='doko:ledger:release:'+state.sha.slice(0,16)+':';let batchReserved=0,dirty=new Set(state.dirty||[]);
 const endpoint=target==='local'?'https://local.invalid':env.UPSTASH_REDIS_REST_URL||env.KV_REST_API_URL,token=target==='local'?'local-only-not-a-real-token':env.UPSTASH_REDIS_REST_TOKEN||env.KV_REST_API_TOKEN;
 if(!endpoint||!token)throw Error('Upstash credentials missing; local work may continue');
 function reserve(cost){if(batchReserved+cost>2500||state.reservedCommands+cost>MAX_COMMANDS)throw Error('storage command cap reached before send');batchReserved+=cost;state.reservedCommands+=cost;state.requests++;saveState(dir,state)}
 async function send(args,cost=1){
  reserve(cost);let value;
  try{if(target==='local'){if(!localCommand)throw Error('local adapter missing');value=await localCommand(args)}else{
   const r=await request(endpoint,{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});if(!r.ok||!r.body?.getReader)throw Error('storage HTTP failure');const reader=r.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>8*1024*1024){await reader.cancel();throw Error('storage response limit')}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()};const data=JSON.parse(Buffer.concat(chunks).toString());if(data.error||!Object.hasOwn(data,'result'))throw Error('storage command rejected');value=data.result;
  }}catch{throw Error('Storage request stopped; no automatic retry; reservation retained')}
  return value;
 }
 const scripts=transport.coreScripts(),rules=new Map(scripts.map(s=>[s.script,s]));
 const client=transport.createTransport({endpoint,token,releaseSha256:state.sha,phase:'new',enabled:true,scripts,maxRequests:2500,maxReservedCommands:2500,request:async(_url,options)=>{
  const args=JSON.parse(options.body),op=args[0],keys=op==='EVAL'?args.slice(3,3+Number(args[2])):op==='MGET'||op==='EXISTS'?args.slice(1):op==='MSET'?args.slice(1).filter((_,i)=>i%2===0):op==='TIME'?[]:[args[1]];
  if(keys.some(k=>typeof k!=='string'||!k.startsWith(prefix))||['SCAN','KEYS','DEL','FLUSHDB','FLUSHALL'].includes(op))throw Error('outside owned namespace');
  const cost=op==='EVAL'?rules.get(args[1]).bound(args):1;for(const k of keys)dirty.add(k);state.dirty=[...dirty];
  return new Response(JSON.stringify({result:await send(args,cost)}));
 }}),command=require('../../api/_release-connection').bind(client);
 async function aggregate(){const d=infoNumbers(await send(['INFO']));if(!Number.isFinite(d.used_memory))throw Error('database memory measurement unavailable');if(target==='upstash'&&d.used_memory+MAX_OWNED_BYTES>MAX_DATABASE_BYTES)throw Error('database capacity headroom insufficient');return {usedMemoryBytes:d.used_memory,totalCommandsProcessed:d.total_commands_processed??null,totalNetInputBytes:d.total_net_input_bytes??null,totalNetOutputBytes:d.total_net_output_bytes??null}}
 async function initialize(){if(state.initialized)return;const value=JSON.stringify({status:'ready',newWorkDailyLimit:300});if(await command(['SET','doko:dev:content-control:v1',value,'NX'])!=='OK')throw Error('namespace collision; no overwrite');state.initialized=true;saveState(dir,state)}
 async function measure(){for(const k of dirty){if(!k.startsWith(prefix))throw Error('measurement outside namespace');const n=await send(['MEMORY','USAGE',k]);if(n!==null&&(!Number.isSafeInteger(Number(n))||Number(n)<0))throw Error('owned memory metric unavailable; reservations retained');state.sizes[k]=Number(n||0)}dirty.clear();state.dirty=[];state.pendingBytes=0;const bytes=Object.values(state.sizes).reduce((a,b)=>a+b,0);if(bytes>MAX_OWNED_BYTES)throw Error('owned storage cap exceeded; stop further writes');saveState(dir,state);return {ownedKeyCount:Object.values(state.sizes).filter(n=>n>0).length,ownedMemoryBytes:bytes,reservedCommands:batchReserved,sessionReservedCommands:state.reservedCommands,sessionRequests:state.requests}}
 function preflight(count){if(!Number.isSafeInteger(count)||count<0||count>16)throw Error('batch size bound');const bytes=Object.values(state.sizes).reduce((a,b)=>a+b,0),reservation=count*262144+2*1024*1024;if(bytes+(state.pendingBytes||0)+reservation>MAX_OWNED_BYTES)throw Error('batch capacity reservation exceeds owned cap');state.pendingBytes=(state.pendingBytes||0)+reservation;saveState(dir,state)}
 return {command,client,state,prefix,aggregate,initialize,measure,preflight,save:()=>saveState(dir,state)};
}
module.exports={storage,infoNumbers,MAX_COMMANDS,MAX_OWNED_BYTES,MAX_DATABASE_BYTES,openState,acquireLock};
