'use strict';
const {normalizeWorkV2,acceptAutomaticUpdate}=require('./_work-ledger-v2-schema');
const {createSeoRecord}=require('../prototype/seo-ledger');
const person=require('../prototype/person-ledger'),season=require('../prototype/season-ledger');
const {digest}=require('./_dev-content-store');
const DAY=86400000;
function coordinator(store,{failureCooldownMs=30*60000}={}){
 const {keys}=store;
 const stale=(at,now,days)=>!Number.isFinite(Date.parse(at))||Date.parse(at)>Date.parse(now)+60000||Date.parse(now)-Date.parse(at)>=days*DAY;
 const entry=(key,snapshot,data,meta={})=>({key,revision:snapshot?.meta.revision||0,data,meta:{...snapshot?.meta,...meta}});
 async function failure(key,old,error,at){
  if(!old?.data)return {status:'failed',record:null,error:String(error.message||error).slice(0,500)};
  const result=await store.commit([entry(key,old,old.data,{lastAttemptAt:at,lastError:String(error.message||error).slice(0,500)})]);
  return {status:result.saved?'stale-error':'conflict',record:old.data,error:String(error.message||error).slice(0,500)};
 }
 function clockGuard(old,at){if(!Number.isFinite(Date.parse(at)))throw Error('invalid content time');const latest=Math.max(Date.parse(old?.meta.lastAttemptAt)||0,Date.parse(old?.data?.checkedAt)||0);return Date.parse(at)<latest}
 function cooldown(old,at){return old?.meta.lastError&&Date.parse(at)-Date.parse(old.meta.lastAttemptAt)<failureCooldownMs}
 async function work(type,id,load,at,{force=false}={}){
  if(!Number.isFinite(Date.parse(at)))throw Error('invalid content time');
  const wk=keys.work(type,id),sk=keys.seo(type,id),seasonKey=type==='tv'?keys.season(id):null;
  const snapshots=await store.read([wk,sk,...(seasonKey?[seasonKey]:[])]),old=snapshots[wk];
  if(clockGuard(old,at))return {status:'clock-behind',record:old.data};
  if(cooldown(old,at))return {status:'cooldown',record:old.data};
  if(old.data&&snapshots[sk].data&&!force)return {status:'cached',record:old.data};
  try{
   let next=old.data;
   if(!next||force){
    const raw=await load();if(!raw||raw.id!==Number(id)||(raw.type&&raw.type!==type))throw Error('work source identity mismatch');
    const input={...old.data,...raw};
    // Missing/empty automatic metadata cannot silently erase populated fixed data.
    if(old.data)for(const field of Object.keys(old.data))if(raw[field]==null||(Array.isArray(raw[field])&&!raw[field].length))input[field]=old.data[field];
    next=acceptAutomaticUpdate(old.data,normalizeWorkV2(type,id,input));
    if(type==='tv'&&!old.data){delete next.seasons;delete next.seasonCount;delete next.episodeCount;}
   }
   const seo=createSeoRecord(next,{updatedAt:at});
   const entries=[entry(wk,old,next,{lastAttemptAt:at,lastError:null}),entry(sk,snapshots[sk],seo,{sourceDigest:digest(next),lastAttemptAt:at,lastError:null})];
   const result=await store.commit(entries);
   return {status:result.saved?'saved':'conflict',record:result.saved?next:old.data,reason:result.reason};
  }catch(error){return failure(wk,old,error,at)}
 }
 async function confirmWork(type,id,at){
  const wk=keys.work(type,id),sk=keys.seo(type,id),snapshot=await store.read([wk,sk]);const old=snapshot[wk];if(!old.data)throw Error('work missing');
  if(old.data.errors?.some(e=>e.status==='open'))throw Error('unresolved work errors');
  const next={...old.data,confirmed:true,locked:true};
  return store.commit([entry(wk,old,next),entry(sk,snapshot[sk],createSeoRecord(next,{updatedAt:at}),{sourceDigest:digest(next)})],{mode:'reviewed'});
 }
 async function refreshPerson(id,load,at){
  const key=keys.person(id),old=(await store.read([key]))[key];
  if(clockGuard(old,at))return {status:'clock-behind',record:old.data};
  if(old.data&&!stale(old.data.checkedAt,at,60))return {status:'cached',record:old.data};
  if(cooldown(old,at))return {status:'cooldown',record:old.data};
  try{
   const raw=await load();if(raw?.id!==Number(id))throw Error('person source identity mismatch');
   for(const list of ['cast','voice','directed','documentary_talk','other']){
    if(!Array.isArray(raw[list]))throw Error('incomplete person credits');
    if(old.data?.person[list]?.length&&!raw[list].length)throw Error('unexpected empty person credits');
   }
   const temp=person.store();if(old.data)temp.load(JSON.stringify({version:2,records:[old.data]}));const next=temp.success(raw,at);
   const result=await store.commit([entry(key,old,next,{lastAttemptAt:at,lastError:null})]);return {status:result.saved?'saved':'conflict',record:result.saved?next:old.data};
  }catch(error){return failure(key,old,error,at)}
 }
 async function refreshSeasons(id,load,at,{status='unknown'}={}){
  const key=keys.season(id),old=(await store.read([key]))[key],days=season.refreshDays(status);
  if(clockGuard(old,at))return {status:'clock-behind',record:old.data};
  if(old.data&&!season.isDue(old.data.checkedAt,at,days))return {status:'cached',record:old.data};
  if(cooldown(old,at))return {status:'cooldown',record:old.data};
  try{
   const raw=await load();if(raw?.tvId!==Number(id)||!Array.isArray(raw.seasons))throw Error('season source identity mismatch');
   if(old.data?.seasons.length&&!raw.seasons.length)throw Error('unexpected empty season manifest');
   const merged=raw.seasons.map(s=>{const prior=old.data?.seasons.find(x=>x.seasonNumber===(s.seasonNumber??s.season_number));return s.episodes==null&&prior?{...s,episodes:prior.episodes,episodesCheckedAt:prior.episodesCheckedAt}:s});
   const next=season.makeRecord(id,merged,at,old.data,days),result=await store.commit([entry(key,old,next,{lastAttemptAt:at,lastError:null})]);return {status:result.saved?'saved':'conflict',record:result.saved?next:old.data};
  }catch(error){return failure(key,old,error,at)}
 }
 async function refreshEpisode(id,number,load,at){
  const key=keys.season(id),old=(await store.read([key]))[key];if(!old.data)throw Error('season manifest required');
  if(clockGuard(old,at))return {status:'clock-behind',record:old.data};
  const previous=old.data.seasons.find(s=>s.seasonNumber===number);if(!previous)throw Error('season number missing');
  if(previous.episodes!==null&&!season.isDue(previous.episodesCheckedAt,at,old.data.refreshDays))return {status:'cached',record:old.data};
  if(cooldown(old,at))return {status:'cooldown',record:old.data};
  try{
   const raw=await load();if(raw?.tvId!==Number(id)||raw.seasonNumber!==number||!Array.isArray(raw.episodes))throw Error('episode source identity mismatch');
   if(previous.episodes?.length&&!raw.episodes.length)throw Error('unexpected empty episodes');
   const updated={...previous,...raw,episodeCount:raw.episodeCount??raw.episodes.length,episodesCheckedAt:at};
   const next=season.makeRecord(id,old.data.seasons.map(s=>s.seasonNumber===number?updated:s),at,old.data,old.data.refreshDays);next.checkedAt=old.data.checkedAt;
   const result=await store.commit([entry(key,old,next,{lastAttemptAt:at,lastError:null})]);return {status:result.saved?'saved':'conflict',record:result.saved?next:old.data};
  }catch(error){return failure(key,old,error,at)}
 }
 return {work,confirmWork,person:refreshPerson,seasons:refreshSeasons,episode:refreshEpisode};
}
module.exports={coordinator};
