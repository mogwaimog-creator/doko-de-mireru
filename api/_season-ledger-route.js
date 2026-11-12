'use strict';
// Integration boundary for a future /api/search season branch.
// Pure dependency injection; no Redis/TMDB access on import and no production wiring.
const {getCachedSeason}=require('./_season-ledger-cache');
function parseSeasonRequest(query){
 const type=String(query?.type||'').trim();
 const rawId=String(query?.id??'');
 const rawSeason=String(query?.season??'');
 if(!/^[1-9]\d*$/.test(rawId)||!/^(0|[1-9]\d*)$/.test(rawSeason))return null;
 const id=Number(rawId),seasonNumber=Number(rawSeason);
 if(!Number.isSafeInteger(id)||!Number.isSafeInteger(seasonNumber))return null;
 if(!['tv','drama','anime'].includes(type))return null;
 return {type:'tv',id,seasonNumber};
}
async function handleSeasonLedgerRequest(query,deps){
 const identity=parseSeasonRequest(query);
 if(!identity)throw Error('Invalid season query');
 return getCachedSeason({...deps,...identity});
}
module.exports={parseSeasonRequest,handleSeasonLedgerRequest};
