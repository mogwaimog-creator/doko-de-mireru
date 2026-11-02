'use strict';
// Independent on-demand detail streaming cache. Existing watch-order series
// continue to use their own 06:00/18:00 schedule and keys.
const {command}=require('./_redis');
const {identity}=require('./_work-ledger');
const PREFIX='doko:detail-providers:v1:';
const DAY=86400000, WEEK=7*DAY;
const LOCK_SECONDS=8, WAIT_MS=2500, STEP_MS=100;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function refreshDue(record,now=Date.now()){
  if(!record||!Number.isFinite(Date.parse(record.checkedAt)))return true;
  const checked=Date.parse(record.checkedAt);
  if(checked>now+60000)return true;
  // Only an on-demand request can revive a dormant work; no global sweep.
  return now-checked>=DAY;
}
function nextReviewAt(now=Date.now()){
  // Stagger around 12:00 JST by stable caller-provided per-work offset.
  const jst=new Date(now+9*3600000);
  const start=Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate(),3,0,0);
  return start<=now?start+DAY:start;
}
function parse(raw){try{return typeof raw==='string'?JSON.parse(raw):raw||null;}catch{return null;}}
async function getDetailProviders(type,id,load,now=Date.now()){
  const w=identity(type,id),key=PREFIX+w.type+':'+w.id;
  const read=async()=>parse(await command(['GET',key]));
  let cached=null;
  try{cached=await read();}
  catch(e){console.error('DETAIL PROVIDERS READ FAILED',e);}
  if(cached&&!refreshDue(cached,now))return {data:cached.data,stale:false};

  const lockKey=key+':refresh-lock', token=require('node:crypto').randomUUID();
  let locked=false,lockFailed=false;
  try{locked=(await command(['SET',lockKey,token,'EX',String(LOCK_SECONDS),'NX']))==='OK';}
  catch(e){console.error('DETAIL PROVIDERS LOCK FAILED',e);lockFailed=true;}

  if(!locked&&!lockFailed){
    // A concurrent visitor should use the last known data, not hit TMDB.
    if(cached)return {data:cached.data,stale:true};
    const deadline=Date.now()+WAIT_MS;
    while(Date.now()<deadline){
      await sleep(Math.min(STEP_MS,Math.max(0,deadline-Date.now())));
      try{
        const latest=await read();
        if(latest&&!refreshDue(latest,now))return {data:latest.data,stale:false};
      }catch(e){console.error('DETAIL PROVIDERS WAIT FAILED',e);break;}
    }
    const error=new Error('Streaming data temporarily busy');
    error.code='DETAIL_PROVIDERS_BUSY';
    throw error;
  }

  try{
    // Check again after taking the lock to avoid duplicate refreshes.
    if(locked){
      try{
        const latest=await read();
        if(latest&&!refreshDue(latest,now))return {data:latest.data,stale:false};
      }catch(e){console.error('DETAIL PROVIDERS LOCKED READ FAILED',e);}
    }
    const data=await load();
    if(!data||typeof data!=='object')throw new Error('Invalid provider payload');
    const next={data,checkedAt:new Date(now).toISOString(),lastAccessedAt:new Date(now).toISOString()};
    try{await command(['SET',key,JSON.stringify(next)]);}
    catch(e){console.error('DETAIL PROVIDERS WRITE FAILED',e);}
    return {data,stale:false};
  }catch(e){
    if(cached)return {data:cached.data,stale:true};
    throw e;
  }finally{
    if(locked){
      const script='if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end';
      await command(['EVAL',script,'1',lockKey,token]).catch(e=>console.error('DETAIL PROVIDERS UNLOCK FAILED',e));
    }
  }
}

module.exports={getDetailProviders,refreshDue,nextReviewAt,DAY,WEEK};
