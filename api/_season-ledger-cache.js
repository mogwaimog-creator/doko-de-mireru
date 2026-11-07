'use strict';
// Future season-ledger cache orchestration. Dependency-injected; no live Redis/TMDB calls.
// fetchSeason must retrieve only TMDB /tv/{id}/season/{number} (no work/provider fetch).
const {seasonResponse}=require('./_season-ledger-response');
function valid(type,id,seasonNumber){
 return type==='tv'&&Number.isSafeInteger(id)&&id>0&&
 Number.isSafeInteger(seasonNumber)&&seasonNumber>=0;
}
function fromTmdbSeason(id,seasonNumber,data){
 if(!data||!Array.isArray(data.episodes))throw Error('Invalid TMDB season payload');
 return {type:'tv',id,seasonNumber,seasonName:data.name||'',
 episodes:data.episodes.filter(e=>Number.isSafeInteger(e.episode_number)&&e.episode_number>0)
 .map(e=>({episodeNumber:e.episode_number,title:e.name||'',airDate:e.air_date||null,
 runtimeMinutes:Number.isFinite(e.runtime)?e.runtime:null,overview:e.overview||''}))};
}
async function getCachedSeason({type,id,seasonNumber,getRecord,putRecordIfAbsent,fetchSeason}){
 if(!valid(type,id,seasonNumber))throw Error('Invalid season identity');
 if(typeof getRecord!=='function'||typeof putRecordIfAbsent!=='function'||typeof fetchSeason!=='function')
  throw Error('Missing season dependencies');
 const saved=await getRecord(type,id,seasonNumber);
 if(saved)return seasonResponse(saved);
 const fetched=await fetchSeason(id,seasonNumber);
 const candidate=fromTmdbSeason(id,seasonNumber,fetched);
 // NX only; a concurrent winner is preferred when available.
 const inserted=await putRecordIfAbsent(candidate);
 if(inserted===false){
  const winner=await getRecord(type,id,seasonNumber);
  if(winner)return seasonResponse(winner);
 }
 return seasonResponse(candidate);
}
module.exports={valid,fromTmdbSeason,getCachedSeason};
