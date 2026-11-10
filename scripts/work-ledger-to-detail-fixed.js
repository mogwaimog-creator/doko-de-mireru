'use strict';
// Offline adapter for the common, display-safe portion of work ledger metadata.
// Not a replacement for the existing full /api/search detail response.
function toDetailFixed(record){
 if(!record||record.schemaVersion!==1||!['movie','tv'].includes(record.type)||
    !Number.isSafeInteger(record.id)||record.id<=0||
    typeof record.title!=='string'||!record.title.trim())throw Error('Invalid work ledger metadata');
 const tv=record.type==='tv';
 const cast=Array.isArray(record.cast)?record.cast.slice(0,tv?10:8).map(p=>({
  id:p.id,name:p.name,character:p.character||'',
  profile_path:p.profile_path||p.profilePath||null
 })):[];
 const directors=Array.isArray(record.directors)?record.directors:[];
 const seasons=tv&&Array.isArray(record.seasons)?record.seasons
  .filter(s=>Number(s.seasonNumber)>0).map(s=>({
   season_number:Number(s.seasonNumber),name:s.name||'',
   episode_count:Number(s.episodeCount||0),air_date:s.airDate||'',
   poster_path:s.posterPath||null
  })):[];
 return {
  id:record.id,title:record.title,original_title:record.originalTitle||record.title,
  release_date:record.releaseDate||'',overview:record.overview||'',
  poster_path:record.posterPath||null,backdrop_path:record.backdropPath||null,
  runtime:Number(record.runtimeMinutes||0),genres:Array.isArray(record.genres)?record.genres:[],
  director:directors[0]?.name||'',cast,seasons,
  vote_average:Number(record.voteAverage||0),vote_count:Number(record.voteCount||0)
 };
}
module.exports={toDetailFixed};
