'use strict';
// Pure TMDB-shaped fixture/copy conversion. No HTTP and no credentials.
const {identity}=require('./_work-ledger-v2-schema');
function personSource(id,profile,credits){
 identity('movie',id);if(profile?.id!==Number(id)||!credits||credits.id!==Number(id)||!Array.isArray(credits.cast)||!Array.isArray(credits.crew))throw Error('incomplete person source or identity mismatch');
 const result={...profile,cast:[],voice:[],directed:[],documentary_talk:[],other:[]};
 for(const row of credits.cast){if(!['movie','tv'].includes(row.media_type))throw Error('untyped person credit');const group=/voice|声|ナレー/i.test(row.character||'')?'voice':row.genre_ids?.some(n=>[99,10764,10767].includes(n))?'documentary_talk':'cast';result[group].push(row)}
 for(const row of credits.crew){if(!['movie','tv'].includes(row.media_type))throw Error('untyped person credit');result[row.job==='Director'?'directed':'other'].push(row)}
 return result;
}
function seasonSource(id,detail){
 identity('tv',id);if(detail?.id!==Number(id)||!Array.isArray(detail.seasons))throw Error('incomplete TV manifest or identity mismatch');
 return {tvId:Number(id),seasons:detail.seasons.map(s=>({seasonNumber:s.season_number,name:s.name,episodeCount:s.episode_count,airDate:s.air_date,posterPath:s.poster_path,episodes:null}))};
}
function episodeSource(id,number,envelope){
 identity('tv',id);const raw=envelope?.data;if(!Number.isSafeInteger(number)||number<1||envelope?.tvId!==Number(id)||envelope?.seasonNumber!==number||raw?.season_number!==number||(raw.show_id!==undefined&&raw.show_id!==Number(id))||!Array.isArray(raw.episodes))throw Error('incomplete episode source or identity mismatch');
 return {tvId:Number(id),seasonNumber:number,episodes:raw.episodes.map(e=>({episodeNumber:e.episode_number,name:e.name,airDate:e.air_date,runtime:e.runtime}))};
}
module.exports={personSource,seasonSource,episodeSource};
