'use strict';
// Candidate request boundary for cutover. Local-only; never activates on production.
const {randomUUID}=require('node:crypto');
const {AsyncLocalStorage}=require('node:async_hooks');
const INSPECT="local values={};if #KEYS>2 then values=redis.call('MGET',unpack(KEYS,3)) end;return {redis.call('GET',KEYS[1]) or false,redis.call('HGETALL',KEYS[2]),values}";
const ENTER="local raw=redis.call('GET',KEYS[1]);if not raw and ARGV[3]=='1' then return 0 end;if raw and cjson.decode(raw).status~='ready' then return 0 end;if redis.call('HLEN',KEYS[2])>=64 then return -1 end;redis.call('HSET',KEYS[2],ARGV[1],ARGV[2]);return 1";
function enabled(){return process.env.DEV_CUTOVER_RUNTIME_ENABLED==='1'&&process.env.NODE_ENV!=='production'&&process.env.VERCEL_ENV!=='production'}
function runtime(command,{controlKey='doko:dev:content-control:v1',activeKey='doko:dev:cutover:v1:active',clock=Date.now,acquisitionPrefix='doko:dev:acquisition:v1:',requireInitializedControl=false,guard=null,locks=['doko:dev:shared-stream:v1:series-batch-lease','doko:dev:legacy-watch:v3:refresh-lock']}={}){
 if(![controlKey,activeKey,...locks].every(k=>/^doko:dev:[a-z0-9:-]+$/.test(k)))throw Error('isolated runtime keys required');
 const admin=require('./_ledger-admin-dev').admin(command,{controlKey,clock}),acquisition=require('./_acquisition-operations-dev').operations(command,{controlKey,clock,prefix:acquisitionPrefix});
 // A read request becomes an active writer immediately before its first mutation.
 // One promise per request also fences parallel writers behind the same admission.
 const requests=new AsyncLocalStorage();
 async function ensureWriter(){
  const c=requests.getStore();
  if(!c)throw Error('missing request boundary');
  if(!c.entering)c.entering=(async()=>{
   const token=randomUUID(),ticket=JSON.stringify({kind:c.kind,startedAt:clock()});
   const entered=guard?await guard.enter(token,ticket):Number(await command(['EVAL',ENTER,'2',controlKey,activeKey,token,ticket,requireInitializedControl?'1':'0']));
   if(entered!==1)throw Object.assign(Error('writer stopped'),{code:'CUTOVER_STOPPED'});
   c.token=token;
  })();
  return c.entering;
 }
 async function readRequest(kind,fn){
  if(typeof kind!=='string'||!/^[a-z0-9:-]{1,60}$/.test(kind))throw Error('bounded writer label required');
  // Keep the existing operator pause behavior, including fail-closed missing control.
  // Admission checks control again atomically if this request later needs to write.
  const raw=await command(['GET',controlKey]);
  if((!raw&&requireInitializedControl)||(raw&&JSON.parse(raw).status!=='ready'))throw Object.assign(Error('shared-pause'),{code:'CUTOVER_STOPPED'});
  return requests.run({kind,token:null,entering:null},async()=>{
   const c=requests.getStore();
   try{return await fn()}
   finally{
    if(c.entering){
     try{await c.entering}
     finally{if(c.token){if(guard)await guard.finish(c.token);else await command(['HDEL',activeKey,c.token])}}
    }
   }
  });
 }
 async function run(kind,fn){if(typeof kind!=='string'||!/^[a-z0-9:-]{1,60}$/.test(kind))throw Error('bounded writer label required');const token=randomUUID(),ticket=JSON.stringify({kind,startedAt:clock()});
  const entered=guard?await guard.enter(token,ticket):Number(await command(['EVAL',ENTER,'2',controlKey,activeKey,token,ticket,requireInitializedControl?'1':'0']));if(entered!==1)throw Object.assign(Error(entered===0?'shared-pause':'writer-capacity'),{code:'CUTOVER_STOPPED'});
  try{return await fn()}finally{if(guard)await guard.finish(token);else await command(['HDEL',activeKey,token])}
 }
 async function status(){const [controlRaw,active,lease]=await command(['EVAL',INSPECT,String(locks.length+2),controlKey,activeKey,...locks]);const tickets=Array.isArray(active)?Object.fromEntries(Array.from({length:active.length/2},(_,i)=>[active[2*i],JSON.parse(active[2*i+1])])):Object.fromEntries(Object.entries(active||{}).map(([k,v])=>[k,JSON.parse(v)]));const control=controlRaw===null||controlRaw===false?null:JSON.parse(controlRaw),drained=Object.keys(tickets).length===0&&lease.every(v=>v===null);return {control,automaticAcquisition:guard?await guard.status():null,acquisition:await acquisition.status(),active:tickets,heldLocks:locks.filter((_,i)=>lease[i]!==null),drained,readyForBackup:control?.status==='paused'&&drained,monitor:await require('./_ledger-scheduler-dev').scheduler(command,{},{controlKey,clock}).health(),notice:'Only instrumented requests are counted; external Cron/legacy writers must be stopped and verified separately. Crashed tickets never auto-expire.'}}
 async function pause(reason){if(typeof reason!=='string'||!reason.trim()||reason.length>300)throw Error('pause reason required');await admin.pause(reason);return status()}
 async function prepareResume(names,reason){if(!(await status()).readyForBackup)throw Error('wait for all writers and locks');return admin.prepareResume(names,{reason})}
 async function resume(plan,acknowledge){if(!(await status()).readyForBackup)throw Error('writers remain active');return admin.resume(plan,{acknowledge})}
 function read(kind,fn){return guard?guard.withContext(()=>readRequest(kind,fn)):readRequest(kind,fn)}
 function wrap(kind,handler,{lazy=false}={}){return async(req,res)=>{try{const execute=()=>lazy?readRequest(kind,()=>handler(req,res)):run(kind,()=>handler(req,res));return await (guard?guard.withContext(execute):execute())}catch(error){if(res.writableEnded)return;res.setHeader('Cache-Control','private, no-store');res.setHeader('Retry-After','5');res.setHeader('X-Robots-Tag','noindex');return res.status(503).end(error.code==='CUTOVER_STOPPED'?'更新と保存を停止しています。':'更新・監視の保存に失敗しました。')}}}
 return {run,read,wrap,ensureWriter,status,pause,prepareResume,resume,setAcquisitionPolicy:acquisition.set};
}
module.exports={runtime,enabled,ENTER,INSPECT};
