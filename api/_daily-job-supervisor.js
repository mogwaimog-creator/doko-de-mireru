'use strict';
// Bounded local runner. Durable daily job remains the source of progress.
// A service scheduler is deliberately not installed or contacted here.
function supervisor(job,{maxInvocations=12,maxElapsedMs=240000,clock=Date.now,onResult=async()=>{}}={}){
 if(!job?.run||!Number.isSafeInteger(maxInvocations)||maxInvocations<1||maxInvocations>48||!Number.isFinite(maxElapsedMs)||maxElapsedMs<1)throw Error('invalid supervisor limits');
 return {async run(at,works,{maxItems=24,signal}={}){
  const start=clock();let last=null;
  for(let i=0;i<maxInvocations;i++){
   if(signal?.aborted||clock()-start>=maxElapsedMs)return {status:'stopped',reason:signal?.aborted?'aborted':'supervisor-time-budget',invocations:i,last};
   try{last=await job.run(at,works,{maxItems,signal})}catch(error){return {status:'stopped',reason:'storage-or-journal-error',error:String(error.message||error).slice(0,300),invocations:i+1,last}}
   await onResult(last);
   if(last.status!=='paused')return {status:last.status,reason:last.reason,invocations:i+1,last};
   // Only intentional chunk/time pauses auto-resume. Failure, busy, dispatch cap stop.
   if(!['item-budget','time-budget'].includes(last.reason))return {status:'stopped',reason:last.reason,invocations:i+1,last};
  }
  return {status:'stopped',reason:'invocation-budget',invocations:maxInvocations,last};
 }};
}
module.exports={supervisor};
