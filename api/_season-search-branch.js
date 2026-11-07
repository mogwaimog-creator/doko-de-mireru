'use strict';
// Factory for a future opt-in season branch in api/search.js.
// Does not change the deployed API or call external services on import.
const {createSeasonApiHandler}=require('./_season-ledger-http');
const {getRecord,putRecordIfAbsent}=require('./_season-ledger-redis');
function makeSeasonSearchBranch({fetchJson,apiKey,storage,refreshRecord}){
 if(typeof fetchJson!=='function'||!apiKey)throw Error('Season fetch dependencies required');
 const fetchSeason=async(id,seasonNumber)=>{
  const url='https://api.themoviedb.org/3/tv/'+encodeURIComponent(id)+
   '/season/'+encodeURIComponent(seasonNumber)+'?api_key='+
   encodeURIComponent(apiKey)+'&language=ja-JP';
  return fetchJson(url);
 };
 const selected=storage||{getRecord,putRecordIfAbsent};
 // Refresh remains opt-in and requires an explicit lock-safe writer.
 // The live branch does not enable refresh merely by importing this module.
 return createSeasonApiHandler({...selected,...(refreshRecord?{refreshRecord}:{}),fetchSeason});
}
module.exports={makeSeasonSearchBranch};
