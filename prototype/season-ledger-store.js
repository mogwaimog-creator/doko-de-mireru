'use strict';
// Offline dependency-injected prototype only. No production Redis, TMDB, or live route access.
const ledger=require('./season-ledger');
function createSeasonStore({read,write,fetchShow,fetchSeason,now=()=>new Date(),maxFetches=5}){
 if(![read,write,fetchShow,fetchSeason].every(f=>typeof f==='function'))throw Error('missing dependencies');
 if(!Number.isSafeInteger(maxFetches)||maxFetches<1)throw Error('invalid fetch limit');
 async function get(tvId){
  const key=Number(tvId);
  if(!Number.isSafeInteger(key)||key<1)throw Error('invalid TV ID');
  const old=await read(key);
  if(old)ledger.validate(old);
  const today=now();
  if(old&&!ledger.isDue(old.checkedAt,today,old.refreshDays))return {record:old,source:'cache'};
  try{
   const show=await fetchShow(key);
   if(!show||!Array.isArray(show.seasons))throw Error('invalid show response');
   const cadence=ledger.refreshDays(show.status,Boolean(show.hasPlannedContinuation));
   const previousByNumber=new Map((old?.seasons||[]).map(s=>[s.seasonNumber,s]));
   const entries=ledger.normalizeSeasons(show.seasons);
   // Avoid API calls for a batch that cannot be committed atomically.
   const due=entries.filter(entry=>{
    const previous=previousByNumber.get(entry.seasonNumber);
    const completed=previous?.episodes!==null&&previous?.episodeCount>0&&previous?.episodes?.length===previous?.episodeCount&&entry.episodeCount===previous.episodeCount;
    return !previous||previous.episodes===null||entry.episodeCount!==previous.episodeCount||ledger.isDue(previous.episodesCheckedAt||old?.checkedAt||'1970-01-01',today,completed?90:7);
   });
   if(due.length>maxFetches)return {record:old||null,source:'batch-limit',required:due.length,limit:maxFetches};
   let fetched=0,partial=false;
   for(const entry of entries){
    const previous=previousByNumber.get(entry.seasonNumber);
    const completed=previous?.episodes!==null&&previous?.episodeCount>0&&previous?.episodes?.length===previous?.episodeCount&&entry.episodeCount===previous.episodeCount;
    const interval=completed?90:7;
    const needsFetch=!previous||previous.episodes===null||entry.episodeCount!==previous.episodeCount||ledger.isDue(previous.episodesCheckedAt||old?.checkedAt||'1970-01-01',today,interval);
    if(needsFetch&&fetched<maxFetches){
     const detail=await fetchSeason(key,entry.seasonNumber);
     if(!detail||!Array.isArray(detail.episodes))throw Error('invalid season response');
     entry.episodes=ledger.normalizeEpisodes(detail.episodes);
     entry.episodesCheckedAt=new Date(today).toISOString();
     fetched++;
    }else if(previous){
     entry.episodes=previous.episodes;
     entry.episodesCheckedAt=previous.episodesCheckedAt;
     if(needsFetch)partial=true;
    }else{partial=true;}
   }
   // No partial snapshots: retain old record until all required season details are available.
   if(partial)return {record:old||null,source:'partial',fetched};
   const record=ledger.makeRecord(key,entries,today,old,cadence);
   await write(key,record);
   return {record,source:'updated',fetched};
  }catch(error){
   if(old)return {record:old,source:'stale',error:String(error.message)};
   return {record:null,source:'error',error:String(error.message)};
  }
 }
 return {get};
}
module.exports={createSeasonStore};
