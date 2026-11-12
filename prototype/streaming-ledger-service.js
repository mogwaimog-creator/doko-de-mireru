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
 async function update(type,id,now,trigger,works,prefetched){
  const k=key(type,id),seriesKeys=membershipSet(works);
  let existing=prefetched===undefined?await redis.read(k):prefetched;
  const state=existing||{type,id:Number(id),lastSuccessAt:null,lastSeriesRunDay:null};
  const backwards=r=>[r?.lastSuccessAt,r?.lastAttemptAt].some(t=>Number.isFinite(Date.parse(t))&&Date.parse(now)<Date.parse(t));
  if(backwards(existing))return {updated:false,reason:'clock-moved-backwards',record:existing};
  let plan=decision({...state,type,id,now,trigger,seriesKeys});
  if(!plan.fetch)return {updated:false,reason:plan.reason,record:existing};
  if(!writesEnabled())return {updated:false,reason:'writes-disabled',record:existing};
  const token=crypto.randomUUID();
  let released=false;
  if(redis.claimAndRead){
   const claim=await redis.claimAndRead(k,token,ttlMs);existing=claim.record;
   if(!claim.acquired)return {updated:false,reason:'in-flight',record:existing};
  }else if(!await redis.acquire(k,token,ttlMs))return {updated:false,reason:'in-flight',record:existing};
  const commit=async record=>{
   if(redis.saveAndRelease){const saved=await redis.saveAndRelease(k,token,record,existing?.revision||0);released=true;return saved}
   return redis.saveIfOwner(k,token,record,existing?.revision||0);
  };
  try{
   if(!redis.claimAndRead){
    try{existing=await redis.read(k)}catch(e){return {updated:false,reason:'storage-read-failed',error:String(e?.message||e).slice(0,200),record:existing}}
   }
   if(backwards(existing))return {updated:false,reason:'clock-moved-backwards',record:existing};
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
   let saved;
   try{saved=await commit(record)}catch(e){return {updated:false,reason:'save-failed',error:String(e?.message||e).slice(0,200),record:existing}}
   if(!saved)return {updated:false,reason:'lease-expired',record:existing};
   return {updated:true,reason:plan.reason,record:redis.saveAndRelease?{...record,schemaVersion:1,revision:(existing?.revision||0)+1}:record};
  }catch(e){
   const message=String(e?.message||e).slice(0,500);
   // Persist a bounded failure summary under the SAME lease, without touching cached JP data.
   // Failure recording must never turn a fetch failure into an empty streaming result.
   let record=existing,recorded=false;
   if(writesEnabled()){
    try{
     const draft=store();draft.register(type,id);
     if(existing)draft.load(JSON.stringify({version:1,records:[existing]}));
     draft.failure(type,id,message,now);
     const r=draft.get(type,id);
     // Count repeated failures in one entry; retain only recent resolved history.
     const open=r.errors.filter(x=>x.status==='open');
     if(open.length>1){
      const latest=open[open.length-1];
      r.errors=r.errors.filter(x=>x.status!=='open'||x===latest);
     }
     r.errors=r.errors.filter(x=>x.status==='open').concat(r.errors.filter(x=>x.status==='resolved').slice(-5));
     if(trigger==='cron')r.lastSeriesRunDay=jstDay(now);
     const candidate=JSON.parse(draft.save()).records[0];
     if(writesEnabled()&&await commit(candidate)){record=redis.saveAndRelease?{...candidate,schemaVersion:1,revision:(existing?.revision||0)+1}:candidate;recorded=true}
    }catch(recordError){/* Preserve the original upstream error. */}
   }
   return {updated:false,reason:'failed',error:message,record,errorRecorded:recorded};
  }
  finally{
   // A transient unlock failure must not mask a completed save or the original fetch error.
   try{if(!released)await redis.release(k,token)}catch(_releaseError){/* Lease expires by TTL. */}
  }
 }
 async function cron(now,works){
  const keys=[...membershipSet(works)],results=new Array(keys.length);
  let snapshot;
  if(redis.readMany){try{snapshot=await redis.readMany(keys)}catch(e){return keys.map(key=>({updated:false,reason:'infrastructure-error',key,error:String(e?.message||e).slice(0,200)}))}}
  const deadline=Date.now()+cronBudgetMs;
  let cursor=0;
  async function worker(){
   while(cursor<keys.length){
    const i=cursor++;
    if(Date.now()>=deadline){results[i]={updated:false,reason:'deferred-budget'};continue}
    const [type,id]=keys[i].split(':');
    // A Redis read/lock/release failure must not abort the remaining batch.
    try{
     results[i]=await update(type,Number(id),now,'cron',works,snapshot?snapshot[keys[i]]:undefined);
    }catch(e){
     results[i]={updated:false,reason:'infrastructure-error',key:keys[i],error:String(e?.message||e).slice(0,200)};
    }
   }
  }
  await Promise.all(Array.from({length:Math.min(maxConcurrency,keys.length)},worker));
  return results;
 }
 return {update,visit:(type,id,now,works)=>update(type,id,now,'visit',works),cron};
}
module.exports={service};
