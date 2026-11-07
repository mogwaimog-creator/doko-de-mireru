'use strict';
// Opt-in refresh orchestration only. No Redis or TMDB operations on import.
// Caller must provide an exclusive refreshRecord implementation before enabling.
const {seasonRefreshDue}=require('./_season-refresh-policy');
const {fromTmdbSeason}=require('./_season-ledger-cache');
const {seasonResponse}=require('./_season-ledger-response');
async function refreshCachedSeason({saved,id,seasonNumber,fetchSeason,refreshRecord,now=Date.now()}){
 if(!saved||saved.type!=='tv'||saved.id!==id||saved.seasonNumber!==seasonNumber)
  throw Error('Invalid saved season identity');
 if(typeof fetchSeason!=='function'||typeof refreshRecord!=='function')
  throw Error('Missing refresh dependencies');
 if(!seasonRefreshDue({checkedAt:saved.checkedAt,status:saved.status,now}))
  return seasonResponse(saved);
 try{
  // refreshRecord must serialize cross-instance refreshes and recheck freshness
  // inside its lock; false means another request owns the refresh.
  const updated=await refreshRecord(saved,async()=>{
   const payload=await fetchSeason(id,seasonNumber);
   return {...fromTmdbSeason(id,seasonNumber,payload),
    checkedAt:new Date(now).toISOString(),status:saved.status||'unknown'};
  });
  return seasonResponse(updated||saved);
 }catch{
  // Preserve last successful season when TMDB or storage refresh fails.
  return seasonResponse(saved);
 }
}
module.exports={refreshCachedSeason};
