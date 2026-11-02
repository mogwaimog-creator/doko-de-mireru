'use strict';
// Independent on-demand detail streaming cache. Existing watch-order series
// continue to use their own 06:00/18:00 schedule and keys.
const {command}=require('./_redis');
const {identity}=require('./_work-ledger');
const PREFIX='doko:detail-providers:v1:';
const DAY=86400000, WEEK=7*DAY;
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
  const start=Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate(),3,0,0)-9*3600000;
  return start<=now?start+DAY:start;
}
function parse(raw){try{return typeof raw==='string'?JSON.parse(raw):raw||null;}catch{return null;}}
async function getDetailProviders(type,id,load,now=Date.now()){
  const w=identity(type,id),key=PREFIX+w.type+':'+w.id;
  let cached=null;
  try{cached=parse(await command(['GET',key]));}
  catch(e){console.error('DETAIL PROVIDERS READ FAILED',e);}
  if(cached&&!refreshDue(cached,now))return {data:cached.data,stale:false};
  try{
    const data=await load();
    // Do not erase last good data on upstream failure.
    if(!data||typeof data!=='object')throw new Error('Invalid provider payload');
    const next={data,checkedAt:new Date(now).toISOString(),lastAccessedAt:new Date(now).toISOString()};
    try{await command(['SET',key,JSON.stringify(next)]);}
    catch(e){console.error('DETAIL PROVIDERS WRITE FAILED',e);}
    return {data,stale:false};
  }catch(e){
    if(cached)return {data:cached.data,stale:true};
    throw e;
  }
}
module.exports={getDetailProviders,refreshDue,nextReviewAt,DAY,WEEK};
