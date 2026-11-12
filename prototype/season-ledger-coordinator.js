'use strict';
// Offline integration prototype. All storage/locks/CAS are injected.
// No live API route, Redis client, or production writes.
const ledger=require('./season-ledger');
const {createSeasonBatch}=require('./season-ledger-batch');
function createSeasonCoordinator(deps){
 const {read,loadStage,saveStage,clearStage,fetchShow,fetchSeason,acquireLock,releaseLock,compareAndSwap,now=()=>new Date(),maxPerRun=5}=deps;
 if(![read,loadStage,saveStage,clearStage,fetchShow,fetchSeason,acquireLock,releaseLock,compareAndSwap].every(f=>typeof f==='function'))throw Error('missing safe persistence dependency');
 return async function get(tvId){
  if(!Number.isSafeInteger(tvId)||tvId<1)throw Error('invalid TV ID');
  const old=await read(tvId);
  if(old)ledger.validate(old);
  const at=now();
  if(old&&!ledger.isDue(old.checkedAt,at,old.refreshDays))return {record:old,source:'cache'};
  const token=await acquireLock(tvId);
  if(!token)return {record:old||null,source:'locked'};
  try{
   // Another worker may have refreshed while this worker was waiting for its lock.
   const current=await read(tvId);
   if(current)ledger.validate(current);
   if(current&&!ledger.isDue(current.checkedAt,at,current.refreshDays))return {record:current,source:'cache'};
   const show=await fetchShow(tvId);
   if(!show||!Array.isArray(show.seasons))throw Error('invalid TV response');
   const list=ledger.normalizeSeasons(show.seasons);
   const byNumber=new Map((current?.seasons||[]).map(s=>[s.seasonNumber,s]));
   const needed=[];
   for(const s of list){
    const prev=byNumber.get(s.seasonNumber);
    const complete=prev?.episodeCount>0&&prev?.episodes?.length===prev.episodeCount&&prev.episodeCount===s.episodeCount;
    const due=!prev||prev.episodes===null||prev.episodeCount!==s.episodeCount||ledger.isDue(prev.episodesCheckedAt||current?.checkedAt||'1970-01-01',at,complete?90:7);
    if(due)needed.push(s.seasonNumber);
   }
   const days=ledger.refreshDays(show.status,Boolean(show.hasPlannedContinuation));
   const manifest=JSON.stringify(list.map(s=>[s.seasonNumber,s.name,s.episodeCount,s.airDate,s.posterPath]));
   const revision=String(show.revision||manifest);
   // A no-op refresh still records the successful show check.
   if(!needed.length){
    const record=ledger.makeRecord(tvId,list.map(s=>({...s,episodes:byNumber.get(s.seasonNumber)?.episodes??null,episodesCheckedAt:byNumber.get(s.seasonNumber)?.episodesCheckedAt??null})),at,current,days);
    const ok=await compareAndSwap(tvId,current,record,token);
    return {record:ok?record:current||null,source:ok?'updated':'conflict'};
   }
   const run=createSeasonBatch({loadStage,saveStage,clearStage,fetchSeason,maxPerRun,
    commit:async({completed})=>{
     const seasons=list.map(s=>{
      const prior=byNumber.get(s.seasonNumber);
      const d=completed[s.seasonNumber];
      return {...s,episodes:d?ledger.normalizeEpisodes(d.episodes):prior?.episodes??null,episodesCheckedAt:d?new Date(at).toISOString():prior?.episodesCheckedAt??null};
     });
     const record=ledger.makeRecord(tvId,seasons,at,current,days);
     return compareAndSwap(tvId,current,record,token);
    }
   });
   const outcome=await run({tvId,seasonNumbers:needed,revision,baseRecord:current||null});
   if(outcome.status==='complete')return {record:await read(tvId),source:'updated'};
   return {record:current||null,source:outcome.status,remaining:outcome.remaining,error:outcome.error};
  }catch(error){
   return {record:old||null,source:old?'stale':'error',error:String(error.message)};
  }finally{
   await releaseLock(tvId,token);
  }
 };
}
module.exports={createSeasonCoordinator};
