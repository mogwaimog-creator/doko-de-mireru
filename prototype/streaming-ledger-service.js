'use strict';
// Offline integration: shared Redis-style store + schedule + TMDB adapter.
// No production imports. All persistence goes through saveIfOwner.
const crypto=require('node:crypto');
const {store,key}=require('./streaming-ledger');
const {membershipSet,decision,jstDay}=require('./streaming-ledger-schedule');
const {fromTmdb}=require('./streaming-ledger-compat');
function service(redis,fetchTmdb,{writesEnabled=()=>true,ttlMs=30000,timeoutMs=6500,maxConcurrency=3,cronBudgetMs=240000}={}){
 if(!redis||!['read','acquire','saveIfOwner','release'].every(x=>typeof redis[x]==='function')||typeof fetchTmdb!=='function'||typeof writesEnabled!=='function')throw Error('invalid service dependencies');
 if(!Number.isSafeInteger(maxConcurrency)||maxConcurrency<1||!Number.isFinite(timeoutMs)||timeoutMs<1||!Number.isFinite(cronBudgetMs)||cronBudgetMs<1||!Number.isFinite(ttlMs)||ttlMs<=timeoutMs)throw Error('invalid service limits');
 async function update(type,id,now,trigger,works){
  const k=key(type,id),seriesKeys=membershipSet(works);
  let existing=await redis.read(k);
  const state=existing||{type,id:Number(id),lastSuccessAt:null,lastSeriesRunDay:null};
  let plan=decision({...state,type,id,now,trigger,seriesKeys});
  if(!plan.fetch)return {updated:false,reason:plan.reason,record:existing};
  if(!writesEnabled())return {updated:false,reason:'writes-disabled',record:existing};
  const token=crypto.randomUUID();
  if(!await redis.acquire(k,token,ttlMs))return {updated:false,reason:'in-flight',record:existing};
  try{
   // Re-read AFTER locking; a different worker may have finished in between.
   existing=await redis.read(k);
   plan=decision({...existing,type,id,now,trigger,seriesKeys,lastSuccessAt:existing?.lastSuccessAt||null,lastSeriesRunDay:existing?.lastSeriesRunDay||null});
   if(!plan.fetch)return {updated:false,reason:plan.reason,record:existing};
   if(!writesEnabled())return {updated:false,reason:'writes-disabled',record:existing};
   // Abort cooperative upstream requests; the expired lease still fences a late response.
   const ac=new AbortController();let timer;
   let response;
   try{response=await Promise.race([
    Promise.resolve().then(()=>fetchTmdb(type,id,{signal:ac.signal})),
    new Promise((_,reject)=>{timer=setTimeout(()=>{ac.abort();reject(Error('upstream timeout'))},timeoutMs)})
   ])}finally{clearTimeout(timer)}
   const draft=store();draft.register(type,id);
   if(existing)draft.load(JSON.stringify({version:1,records:[existing]}));
   draft.success(type,id,fromTmdb(response),now);
   draft.resolve(type,id);
   if(trigger==='cron')draft.get(type,id).lastSeriesRunDay=jstDay(now);
   const record=JSON.parse(draft.save()).records[0];
   if(!writesEnabled())return {updated:false,reason:'writes-disabled',record:existing};
   if(!await redis.saveIfOwner(k,token,record))return {updated:false,reason:'lease-expired',record:existing};
   return {updated:true,reason:plan.reason,record};
  }catch(e){return {updated:false,reason:'failed',error:String(e?.message||e),record:existing}}
  finally{await redis.release(k,token)}
 }
 async function cron(now,works){
  const keys=[...membershipSet(works)],results=new Array(keys.length);
  const deadline=Date.now()+cronBudgetMs;
  let cursor=0;
  async function worker(){
   while(cursor<keys.length){
    const i=cursor++;
    if(Date.now()>=deadline){results[i]={updated:false,reason:'deferred-budget'};continue}
    const [type,id]=keys[i].split(':');
    results[i]=await update(type,Number(id),now,'cron',works);
   }
  }
  await Promise.all(Array.from({length:Math.min(maxConcurrency,keys.length)},worker));
  return results;
 }
 return {update,visit:(type,id,now,works)=>update(type,id,now,'visit',works),cron};
}
module.exports={service};
