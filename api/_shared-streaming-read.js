'use strict';
// Development-only compatibility reads. Never use production Redis credentials.
const {sharedStore}=require('./_shared-streaming-store');
const {store,key}=require('../prototype/streaming-ledger');
const {toDetail,toWatch}=require('../prototype/streaming-ledger-compat');
function enabled(){return process.env.SHARED_STREAMING_READ_ENABLED==='1'&&process.env.VERCEL_ENV!=='production'&&process.env.NODE_ENV!=='production'}
async function devCommand(args){
 const url=new URL(process.env.SHARED_LEDGER_DEV_URL||'http://127.0.0.1:16380');
 if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('local isolated Redis required');
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(1500)});
 if(!response.ok)throw Error('isolated Redis unavailable');const result=await response.json();if(result.error)throw Error('isolated Redis command failed');return result.result;
}
function compatible(raw,type,id,now=Date.now()){
 try{
  if(!raw||raw.type!==type||raw.id!==Number(id)||raw.schemaVersion!==1||!Number.isSafeInteger(raw.revision)||raw.revision<1)return null;
  const at=Date.parse(raw.lastSuccessAt);if(!Number.isFinite(at)||at>now+60000)return null;
  if(!['flatrate','rent','buy'].every(k=>Array.isArray(raw.japan?.[k])))return null;
  const ledger=store();ledger.load(JSON.stringify({version:1,records:[raw]}));
  return {detail:raw.coverage&&!['flatrate','rent','buy'].every(k=>raw.coverage.includes(k))?null:toDetail(ledger,type,id),watch:{...toWatch(ledger,type,id),stale:now-at>=86400000||raw.errors?.some(e=>e.status==='open')===true}};
 }catch{return null}
}
async function readMany(works,{command=devCommand,now=Date.now()}={}){
 const s=sharedStore(command),keys=[...new Set(works.map(w=>key(w.type,w.id)))];if(!keys.length)return {};
 const values=await command(['MGET',...keys.map(s.keys.dataKey)]);if(!Array.isArray(values)||values.length!==keys.length)throw Error('invalid batch result');
 const out={};keys.forEach((k,i)=>{try{const [type,id]=k.split(':');const r=compatible(JSON.parse(values[i]),type,Number(id),now);if(r)out[k]=r}catch{}});return out;
}
async function readDetail(type,id,now){if(!enabled())return null;try{const r=(await readMany([{type,id}],{now}))[key(type,id)];return r?.detail?{data:r.detail.data,stale:r.watch.stale}:null}catch{return null}}
async function attachRelated(detail){
 if(!enabled()||!detail||typeof detail!=='object')return detail;
 const items=Array.isArray(detail.series)?detail.series:detail.series?.movies||[];
 const works=items.filter(w=>w?.title&&Number.isSafeInteger(Number(w.id))&&Number(w.id)>0).map(w=>({type: ['tv','tv_drama','anime_tv'].includes(w.content_type)||['TVシリーズ','TV','TVアニメ'].includes(w.media_type)?'tv':'movie',id:Number(w.id)}));
 if(!works.length||works.length>100)return detail;
 try{const records=await readMany(works),byWork={};for(const [k,r] of Object.entries(records))if(!r.watch.stale)byWork[k]=r.watch.flatrate;
 return {...detail,seriesStreamingByWork:byWork};}catch{return detail}
}
module.exports={enabled,devCommand,compatible,readMany,readDetail,attachRelated};
