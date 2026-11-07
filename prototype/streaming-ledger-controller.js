'use strict';
// Offline integration of the streaming ledger and schedule policy.
// Caller owns membership list and fetch function. No network or production writes.
const {membershipSet,decision,jstDay}=require('./streaming-ledger-schedule');
function controller(ledger,fetchProviders,{timeoutMs=10000,maxConcurrency=3,distributedLease=null}={}){
 if(typeof fetchProviders!=='function'||!Number.isInteger(maxConcurrency)||maxConcurrency<1||!Number.isFinite(timeoutMs)||timeoutMs<1)throw Error('invalid options');
 const inFlight=new Set();
 async function update(type,id,now,trigger,seriesKeys){
  const k=type+':'+Number(id),record=ledger.get(type,id);
  if(!record)ledger.register(type,id);
  const current=ledger.get(type,id);
  const decisionResult=decision({type,id,lastSuccessAt:current.lastSuccessAt,now,seriesKeys,trigger,lastSeriesRunDay:current.lastSeriesRunDay});
  if(!decisionResult.fetch)return {key:k,updated:false,reason:decisionResult.reason};
  if(inFlight.has(k))return {key:k,updated:false,reason:'in-flight'};
  inFlight.add(k);
  const perform=async({commit}={})=>{
  try{
   // A timeout must not be treated as a successful refresh. The fetcher should
   // accept AbortSignal to cancel external requests.
   const ac=new AbortController();
   let timer;
   try{
    const response=await Promise.race([
     Promise.resolve().then(()=>fetchProviders(type,id,{signal:ac.signal})),
     new Promise((_,reject)=>{timer=setTimeout(()=>{ac.abort();reject(Error('timeout'))},timeoutMs)})
    ]);
    const write=()=>{
     ledger.success(type,id,response,now);
     ledger.resolve(type,id);
     if(trigger==='cron')current.lastSeriesRunDay=jstDay(now);
    };
    if(commit){if(!await commit(write))return {key:k,updated:false,reason:'lease-expired'};}
    else write();
    return {key:k,updated:true,reason:decisionResult.reason};
   }finally{clearTimeout(timer)}
  }catch(e){
   ledger.failure(type,id,e?.message||'fetch failed',now);
   return {key:k,updated:false,reason:'failed',error:String(e?.message||e)};
  }
  };
  try{
   if(distributedLease){
    const result=await distributedLease.run('streaming:'+k,perform);
    return result.acquired?result.value:{key:k,updated:false,reason:'distributed-in-flight'};
   }
   return await perform();
  }finally{inFlight.delete(k)}
 }
 async function visit(type,id,now,works){return update(type,id,now,'visit',membershipSet(works))}
 async function cron(now,works){
  const keys=[...membershipSet(works)],results=[];
  for(let i=0;i<keys.length;i+=maxConcurrency){
   const group=keys.slice(i,i+maxConcurrency);
   results.push(...await Promise.all(group.map(k=>{const [type,id]=k.split(':');return update(type,Number(id),now,'cron',new Set(keys))})));
  }
  return results;
 }
 return {visit,cron};
}
module.exports={controller};
