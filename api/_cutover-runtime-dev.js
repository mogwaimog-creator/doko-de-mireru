'use strict';
// Candidate request boundary for cutover. Local-only; never activates on production.
const {randomUUID}=require('node:crypto');
const INSPECT="local values={};if #KEYS>2 then values=redis.call('MGET',unpack(KEYS,3)) end;return {redis.call('GET',KEYS[1]) or false,redis.call('HGETALL',KEYS[2]),values}";
const ENTER="local raw=redis.call('GET',KEYS[1]);if not raw and ARGV[3]=='1' then return 0 end;if raw and cjson.decode(raw).status~='ready' then return 0 end;if redis.call('HLEN',KEYS[2])>=64 then return -1 end;redis.call('HSET',KEYS[2],ARGV[1],ARGV[2]);return 1";
function enabled(){return process.env.DEV_CUTOVER_RUNTIME_ENABLED==='1'&&process.env.NODE_ENV!=='production'&&process.env.VERCEL_ENV!=='production'}
function runtime(command,{controlKey='doko:dev:content-control:v1',activeKey='doko:dev:cutover:v1:active',clock=Date.now,acquisitionPrefix='doko:dev:acquisition:v1:',requireInitializedControl=false,locks=['doko:dev:shared-stream:v1:series-batch-lease','doko:dev:legacy-watch:v3:refresh-lock']}={}){
 if(![controlKey,activeKey,...locks].every(k=>/^doko:dev:[a-z0-9:-]+$/.test(k)))throw Error('isolated runtime keys required');
 const admin=require('./_ledger-admin-dev').admin(command,{controlKey,clock}),acquisition=require('./_acquisition-operations-dev').operations(command,{controlKey,clock,prefix:acquisitionPrefix});
 async function run(kind,fn){if(typeof kind!=='string'||!/^[a-z0-9:-]{1,60}$/.test(kind))throw Error('bounded writer label required');const token=randomUUID(),ticket=JSON.stringify({kind,startedAt:clock()});
  const entered=Number(await command(['EVAL',ENTER,'2',controlKey,activeKey,token,ticket,requireInitializedControl?'1':'0']));if(entered!==1)throw Object.assign(Error(entered===0?'shared-pause':'writer-capacity'),{code:'CUTOVER_STOPPED'});
  try{return await fn()}finally{await command(['HDEL',activeKey,token])}
 }
 async function status(){const [controlRaw,active,lease]=await command(['EVAL',INSPECT,String(locks.length+2),controlKey,activeKey,...locks]);const tickets=Array.isArray(active)?Object.fromEntries(Array.from({length:active.length/2},(_,i)=>[active[2*i],JSON.parse(active[2*i+1])])):Object.fromEntries(Object.entries(active||{}).map(([k,v])=>[k,JSON.parse(v)]));const control=controlRaw===null||controlRaw===false?null:JSON.parse(controlRaw),drained=Object.keys(tickets).length===0&&lease.every(v=>v===null);return {control,acquisition:await acquisition.status(),active:tickets,heldLocks:locks.filter((_,i)=>lease[i]!==null),drained,readyForBackup:control?.status==='paused'&&drained,monitor:await require('./_ledger-scheduler-dev').scheduler(command,{},{controlKey,clock}).health(),notice:'Only instrumented requests are counted; external Cron/legacy writers must be stopped and verified separately. Crashed tickets never auto-expire.'}}
 async function pause(reason){if(typeof reason!=='string'||!reason.trim()||reason.length>300)throw Error('pause reason required');await admin.pause(reason);return status()}
 async function prepareResume(names,reason){if(!(await status()).readyForBackup)throw Error('wait for all writers and locks');return admin.prepareResume(names,{reason})}
 async function resume(plan,acknowledge){if(!(await status()).readyForBackup)throw Error('writers remain active');return admin.resume(plan,{acknowledge})}
 function wrap(kind,handler){return async(req,res)=>{try{return await run(kind,()=>handler(req,res))}catch(error){if(res.writableEnded)return;res.setHeader('Cache-Control','private, no-store');res.setHeader('Retry-After','5');res.setHeader('X-Robots-Tag','noindex');return res.status(503).end(error.code==='CUTOVER_STOPPED'?'更新と保存を停止しています。':'更新・監視の保存に失敗しました。')}}}
 return {run,wrap,status,pause,prepareResume,resume,setAcquisitionPolicy:acquisition.set};
}
module.exports={runtime,enabled,ENTER,INSPECT};
