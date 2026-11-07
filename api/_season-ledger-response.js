'use strict';
// Pure adapter for a future lazy-loaded season/episode ledger.
// No Redis access or TMDB calls. NOT connected to production.
function seasonResponse(record){
 if(!record||record.type!=='tv'||!Number.isSafeInteger(record.id)||record.id<=0||
    !Number.isSafeInteger(record.seasonNumber)||record.seasonNumber<0||
    !Array.isArray(record.episodes))throw Error('Invalid season record');
 const episodes=record.episodes.map(e=>{
   const n=Number(e.episodeNumber);
   if(!Number.isSafeInteger(n)||n<=0)throw Error('Invalid episode number');
   return {episode_number:n,name:e.title||'',air_date:e.airDate||null,
     runtime:e.runtimeMinutes??null,overview:e.overview||''};
 });
 return {season_number:record.seasonNumber,season_name:record.seasonName||'',episodes};
}
module.exports={seasonResponse};
