'use strict';
// Offline integration contract. No Redis, TMDB, or production imports.
// read/write MUST be durable and atomic in production; lock must be distributed.
const {decide}=require('./streaming-update-schedule');
async function refreshFlow({type,id,at,watchOrder=false,scheduled=false,read,write,lock,fetchJapan,token}){
 if(!['movie','tv'].includes(type)||!Number.isSafeInteger(Number(id))||Number(id)<1)throw Error('invalid identity');
 if([read,write,fetchJapan].some(x=>typeof x!=='function')||!lock||typeof lock.run!=='function')throw Error('missing adapters');
 const before=await read(type,id);
 if(!before)throw Error('unregistered work');
 const due=decide(before,{at,watchOrder,scheduled});
 if(!due.due)return {status:'skipped',reason:due.reason,record:before};
 const outcome=await lock.run({type,id,token,refresh:async()=>{
  // Re-read inside lock: another worker may have finished after the first read.
  const current=await read(type,id);
  if(!current)throw Error('unregistered work');
  const check=decide(current,{at,watchOrder,scheduled});
  if(!check.due)return {status:'skipped',reason:check.reason,record:current};
  const next=JSON.parse(JSON.stringify(current));
  const when=new Date(at).toISOString();
  next.lastAttemptAt=when;
  if(watchOrder)next.lastSeriesRunDay=check.runDay;
  try{
   const jp=await fetchJapan(type,id);
   if(!jp||typeof jp!=='object'||Array.isArray(jp)||!['flatrate','rent','buy'].every(k=>Array.isArray(jp[k])))throw Error('invalid JP streaming payload');
   next.japan={flatrate:jp.flatrate,rent:jp.rent,buy:jp.buy};
   next.lastSuccessAt=when;
   next.nextEligibleAt=new Date(Date.parse(when)+86400000).toISOString();
   next.errors=[];
   await write(type,id,next);
   return {status:'success',record:next};
  }catch(error){
   // Do not turn a failed write of a successful fetch into a false fetch failure.
   if(error&&error.message==='write failed')throw error;
   next.errors=[...(current.errors||[]),{message:String(error?.message||error).slice(0,500),status:'open',at:when}];
   await write(type,id,next);
   return {status:'failed',record:next};
  }
 }});
 if(outcome.status==='busy')return {status:'busy',record:before};
 return outcome.value;
}
module.exports={refreshFlow};
