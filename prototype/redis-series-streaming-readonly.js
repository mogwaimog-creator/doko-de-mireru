'use strict';
// Read-only bridge to existing detail provider cache; no refresh, SET or TMDB.
// MGET batches related works into one Redis command.
const PREFIX='doko:detail-providers:v1:';
const MAX_ITEMS=30;
function typeFor(item){
 return ['tv','tv_drama','anime_tv'].includes(item?.content_type)||
 ['TVシリーズ','TV','TVアニメ'].includes(item?.media_type)?'tv':'movie';
}
function itemsOf(series){return Array.isArray(series)?series:Array.isArray(series?.movies)?series.movies:[];}
function parse(raw,now=Date.now()){
 // This legacy cache is on-demand with a 24-hour refresh policy.
 // Stale data must not be treated as a confirmed current no-streaming result.
 try{
  const r=typeof raw==='string'?JSON.parse(raw):raw;
  if(!r||typeof r!=='object'||!r.data||!r.data.results||!r.checkedAt||!Number.isFinite(Date.parse(r.checkedAt)))return null;
  const checked=Date.parse(r.checkedAt);
  if(checked>now+60000||now-checked>=86400000)return null;
  const jp=r.data.results.JP;
  if(!jp||typeof jp!=='object'||Array.isArray(jp))return null;
  // A missing or malformed flatrate field is not proof of zero providers.
  if(!Array.isArray(jp.flatrate))return null;
  return jp.flatrate;
 }catch{return null}
}
function convert(values){
 const out=[],seen=new Set();
 for(const p of values){
  const id=Number(p?.provider_id??p?.providerId);
  const name=String(p?.provider_name??p?.name??'').trim();
  if(!Number.isSafeInteger(id)||id<1||!name||seen.has(id))continue;
  seen.add(id);
  out.push({provider_id:id,provider_name:name,logo_path:typeof(p.logo_path??p.logoPath)==='string'?(p.logo_path??p.logoPath):null});
 }
 return out;
}
async function attachCachedSeriesStreaming(detail,{command,now=Date.now()}={}){
 if(!detail||typeof detail!=='object'||Array.isArray(detail))throw Error('invalid detail');
 if(typeof command!=='function')throw Error('missing read-only Redis command');
 const keys=[],seen=new Set();
 for(const item of itemsOf(detail.series)){
  const id=Number(item?.id);
  if(!Number.isSafeInteger(id)||id<1||!item?.title)continue;
  const k=typeFor(item)+':'+id;
  if(seen.has(k))continue;
  if(keys.length>=MAX_ITEMS)return detail; // No partial cache result for oversized series.
  seen.add(k);keys.push(k);
 }
 if(!keys.length)return detail;
 let values;
 try{values=await command(['MGET',...keys.map(k=>PREFIX+k)]);}
 catch{return detail;} // Legacy per-card path remains available.
 if(!Array.isArray(values)||values.length!==keys.length)return detail;
 const byWork=Object.create(null);
 keys.forEach((k,i)=>{const data=parse(values[i],now);if(data!==null)byWork[k]=convert(data);});
 return {...detail,seriesStreamingByWork:byWork};
}
module.exports={attachCachedSeriesStreaming,parse,convert,MAX_ITEMS};
