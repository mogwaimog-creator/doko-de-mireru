'use strict';
// Development transport only. Compact canonical work + SEO (+ TV manifest), no raw cache.
const {randomUUID}=require('node:crypto'),{identity,normalizeWorkV2}=require('./_work-ledger-v2-schema');
const {contentStore,digest}=require('./_dev-content-store'),{createSeoRecord}=require('../prototype/seo-ledger');
// Atomically count new-work attempts. No cumulative byte reservation: each bundle
// is bounded separately before its CAS publication below.
const RESERVE=`local c=redis.call('GET',KEYS[1]);local control={};if c then local ok,v=pcall(cjson.decode,c);if not ok then return {0,'invalid-control'} end;control=v end
if control.status~='ready' then return {0,'paused'} end
if control.newWorkAcquisitionPaused then return {0,'acquisition-paused'} end
local count=tonumber(redis.call('GET',KEYS[2]) or '0');if control.newWorkDailyLimit and count>=tonumber(control.newWorkDailyLimit) then return {0,'daily-limit'} end
redis.call('INCR',KEYS[2]);redis.call('PEXPIREAT',KEYS[2],ARGV[1]);return {1,'counted'}`;
const SETTLE="if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;if redis.call('GET',KEYS[2])~=ARGV[2] then return 0 end;redis.call('INCRBY',KEYS[3],ARGV[3]);return 1";
function canonical(type,id,raw){
 require('./_frozen-load').verified(raw,id,'work',type);
 const tv=type==='tv';return normalizeWorkV2(type,id,{title:tv?raw.name:raw.title,originalTitle:tv?raw.original_name:raw.original_title,releaseDate:tv?raw.first_air_date:raw.release_date,posterPath:raw.poster_path,overview:raw.overview,runtimeMinutes:tv?raw.episode_run_time?.[0]:raw.runtime,genres:raw.genres,director:raw.credits?.crew?.find(p=>p.job==='Director'),cast:raw.credits?.cast,rating:raw.vote_average,status:raw.status});
}
async function ingest(type,id,{command,load,clock=Date.now,controlKey='doko:dev:content-control:v1',prefix='doko:dev:acquisition:v1:'}={}){
 identity(type,id);if(((process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')&&!require('./_release-connection').approvedCommand(command))||!/^doko:dev:[a-z0-9:-]+:$/.test(prefix))throw Error('development acquisition only');
 const store=contentStore(command,{controlKey}),wk=store.keys.work(type,id),sk=store.keys.seo(type,id),tk=type==='tv'?store.keys.season(id):null,names=[wk,sk,...(tk?[tk]:[])];
 const before=await store.read(names);if(before[wk].data)return before[wk].data;
 const token=randomUUID(),lease={key:wk,token};if(!await store.claimLease(wk,token,15000))throw Object.assign(Error('work acquisition busy or paused'),{code:'WORK_ACQUISITION_STOPPED'});
 try{
  const current=await store.read(names);if(current[wk].data)return current[wk].data;if(names.some(k=>k!==wk&&current[k].data))throw Error('orphan SEO/season requires review');
  const now=clock(),at=new Date(now).toISOString(),day=new Date(now+9*3600000).toISOString().slice(0,10),deadline=Date.parse(day+'T00:00:00+09:00')+2*86400000;
  // Count attempts without allocating capacity for work that may never be saved.
  const admitted=await command(['EVAL',RESERVE,'2',controlKey,prefix+'attempts:'+day,String(deadline)]);if(Number(admitted[0])!==1)throw Object.assign(Error('work acquisition '+admitted[1]),{code:'WORK_ACQUISITION_STOPPED'});
  let timer;const ac=new AbortController();const raw=await Promise.race([Promise.resolve().then(()=>load(ac.signal)),new Promise((_,reject)=>{timer=setTimeout(()=>{ac.abort();reject(Error('work acquisition timeout'))},6500)})]).finally(()=>clearTimeout(timer));
  const work=canonical(type,id,raw);if(type==='tv'){delete work.seasons;delete work.seasonCount;delete work.episodeCount}
  const seo=createSeoRecord(work,{updatedAt:at}),entries=[{key:wk,data:work,revision:current[wk].meta.revision},{key:sk,data:seo,revision:current[sk].meta.revision,meta:{sourceDigest:digest(work)}}];
  if(tk){if(!Array.isArray(raw.seasons))throw Error('TV season manifest required');if(current[tk].data)throw Error('orphan season manifest requires review');entries.push({key:tk,data:require('../prototype/season-ledger').makeRecord(id,raw.seasons.map(s=>({seasonNumber:s.season_number,name:s.name,episodeCount:s.episode_count,airDate:s.air_date,posterPath:s.poster_path})),at,null,require('../prototype/season-ledger').refreshDays(raw.status)),revision:current[tk].meta.revision})}
  // Include index document in the byte check; no raw response, provider data or credits bulk.
  const index=require('./_search-index-v2').document(wk,work),bundleBytes=Buffer.byteLength(JSON.stringify({entries,index}));if(bundleBytes>200000)throw Error('compact work bundle too large');
  const accounted=bundleBytes+Buffer.byteLength(JSON.stringify(index?.members||[]))+1024;if(accounted>262144)throw Error('indexed bundle exceeds per-work size bound');
  const result=await store.commit(entries,{lease,requireReady:true});if(!result.saved)throw Error('work publication stopped: '+result.reason);
  return work;
 }finally{await store.releaseLease(wk,token)}
}
module.exports={ingest,canonical,RESERVE,SETTLE};
