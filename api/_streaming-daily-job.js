'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {membershipSet,jstDay}=require('../prototype/streaming-ledger-schedule');
const {service}=require('../prototype/streaming-ledger-service');
function dailyJob(records,jobs,fetchProviders,{chunkSize=12,maxConcurrency=3,budgetMs=200000,leaseMs=300000,maxDispatchesPerWork=2,clock=Date.now,onCheckpoint=async()=>{},...serviceOptions}={}){
 if(!records?.readMany||!jobs?.claim||!jobs?.checkpoint||!jobs?.release||typeof fetchProviders!=='function')throw Error('daily job dependencies required');
 if(!Number.isSafeInteger(chunkSize)||chunkSize<1||chunkSize>48||!Number.isSafeInteger(maxConcurrency)||maxConcurrency<1||maxConcurrency>6||!Number.isSafeInteger(maxDispatchesPerWork)||maxDispatchesPerWork<1||maxDispatchesPerWork>5||!Number.isFinite(budgetMs)||budgetMs<1||!Number.isSafeInteger(leaseMs)||leaseMs<1)throw Error('invalid job limits');
 const engine=service(records,fetchProviders,{maxConcurrency,...serviceOptions});
 function terminal(record,day){if(record?.lastSeriesRunDay!==day)return null;return record.errors?.some(e=>e.status==='open')?'failed':'success'}
 function summary(job,reason){const values=Object.values(job.completed),done=values.length;return {status:job.status,reason,day:job.day,total:job.keys.length,attempted:done,succeeded:values.filter(v=>v==='success').length,failed:values.filter(v=>v==='failed').length,pending:job.keys.length-done,dispatches:Object.values(job.dispatches).reduce((n,v)=>n+v,0),revision:job.revision}}
 async function run(at,works,{maxItems=1000,signal}={}){
  const time=Date.parse(at);if(!Number.isFinite(time)||!Number.isSafeInteger(maxItems)||maxItems<0)throw Error('invalid job request');
  const day=jstDay(at),keys=[...membershipSet(works)].sort();
  if(keys.length>1000)throw Error('roster exceeds development safety limit');
  if(time<Date.parse(day+'T06:00:00+09:00'))return {status:'not-due',reason:'before-six-jst',day,total:keys.length};
  const manifestHash=createHash('sha256').update(JSON.stringify(keys)).digest('hex'),token=randomUUID();
  const initial={schemaVersion:1,day,manifestHash,keys,completed:{},dispatches:{},status:'pending',revision:0,createdAt:at,updatedAt:at,invocations:0};
  const claim=await jobs.claim(day,token,leaseMs,initial);
  if(!claim.acquired)return {status:'busy',day,total:keys.length};
  let job=claim.job,released=false,dispatched=0;
  const checkpoint=async(status,release=false)=>{
   const next={...job,status,revision:job.revision+1,updatedAt:at};
   if(!await jobs.checkpoint(day,token,job.revision,next,{release}))throw Error('job checkpoint lost ownership or version');
   job=next;released=release;await onCheckpoint(job);
  };
  try{
   if(!job||job.schemaVersion!==1||!Number.isSafeInteger(job.revision)||job.revision<0||!job.completed||!job.dispatches||!Number.isSafeInteger(job.invocations)||job.invocations<0)throw Error('invalid daily journal; preserved for review');
   if(job.manifestHash!==manifestHash||job.day!==day||JSON.stringify(job.keys)!==JSON.stringify(keys))throw Error('daily roster changed; existing manifest preserved');
   if(Object.entries(job.completed).some(([k,v])=>!keys.includes(k)||!['success','failed'].includes(v))||Object.entries(job.dispatches).some(([k,v])=>!keys.includes(k)||!Number.isSafeInteger(v)||v<1))throw Error('invalid daily progress; preserved for review');
   if(job.status==='complete'||job.status==='complete-with-errors'){await jobs.release(day,token);released=true;return summary(job,'already-finished')}
   job={...job,completed:{...job.completed},dispatches:{...job.dispatches},invocations:job.invocations+1};
   // Native per-work markers reconcile commits made before a crash/checkpoint failure.
   const snapshot=await records.readMany(keys.filter(k=>!job.completed[k]));
   for(const k of keys){const state=terminal(snapshot[k],day);if(!job.completed[k]&&state)job.completed[k]=state}
   const deadline=clock()+budgetMs;
   let reason='finished';
   while(Object.keys(job.completed).length<keys.length){
    if(signal?.aborted){reason='aborted';break}
    if(clock()>=deadline){reason='time-budget';break}
    if(dispatched>=maxItems){reason='item-budget';break}
    const pending=keys.filter(k=>!job.completed[k]);
    const eligible=pending.filter(k=>(job.dispatches[k]||0)<maxDispatchesPerWork);
    if(!eligible.length){reason='dispatch-budget';break}
    const batch=eligible.slice(0,Math.min(chunkSize,maxItems-dispatched));
    // Persist intent BEFORE any upstream call; crash recovery cannot bypass the cap.
    for(const k of batch)job.dispatches[k]=(job.dispatches[k]||0)+1;
    await checkpoint('running');dispatched+=batch.length;
    let cursor=0,blocked=false;
    async function worker(){while(cursor<batch.length){const k=batch[cursor++],[type,id]=k.split(':');
     try{const result=await engine.update(type,Number(id),at,'cron',works,snapshot[k]);const state=terminal(result.record,day);if(state)job.completed[k]=state;else blocked=true}catch{blocked=true}
    }}
    await Promise.all(Array.from({length:Math.min(maxConcurrency,batch.length)},worker));
    const complete=Object.keys(job.completed).length===keys.length;
    if(complete){await checkpoint(Object.values(job.completed).includes('failed')?'complete-with-errors':'complete',true);return summary(job,'finished')}
    // A nonterminal storage/lease error must not spin and issue unbounded retries.
    const pause=blocked||signal?.aborted||clock()>=deadline||dispatched>=maxItems;
    await checkpoint(pause?'paused':'running',pause);
    if(pause)return summary(job,blocked?'retry-required':signal?.aborted?'aborted':clock()>=deadline?'time-budget':'item-budget');
   }
   const complete=Object.keys(job.completed).length===keys.length;
   await checkpoint(complete?(Object.values(job.completed).includes('failed')?'complete-with-errors':'complete'):'paused',true);
   return summary(job,reason);
  }finally{if(!released){try{await jobs.release(day,token)}catch{/* own lease expires */}}}
 }
 return {run};
}
module.exports={dailyJob};
