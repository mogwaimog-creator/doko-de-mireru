'use strict';
// Offline-only season ledger foundation. Does not access TMDB, Redis, or live routes.
const FIELDS=['tvId','seasons','createdAt','checkedAt','schemaVersion'];
const SEASON_FIELDS=['seasonNumber','name','episodeCount','airDate','posterPath','episodes','episodesCheckedAt'];
const EPISODE_FIELDS=['episodeNumber','name','airDate','runtime'];
const DAY=86400000;
function id(v){const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw Error('invalid TV ID');return n;}
function number(v){const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null;}
function str(v,max=200){return typeof v==='string'?v.slice(0,max):null;}
function exact(o,keys){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(o,k)))throw Error('unexpected season ledger fields');}
function normalizeEpisodes(input){
 if(input===null||input===undefined)return null; // null means not fetched; never treat as zero episodes
 if(!Array.isArray(input))throw Error('invalid episode list');
 const seen=new Set();
 return input.map(e=>{
  if(!e||typeof e!=='object')throw Error('invalid episode');
  const n=number(e.episodeNumber??e.episode_number);
  if(n===null||n===0||seen.has(n))throw Error('invalid or duplicate episode number');
  seen.add(n);
  return {episodeNumber:n,name:str(e.name),airDate:str(e.airDate??e.air_date,30),runtime:number(e.runtime)};
 }).sort((a,b)=>a.episodeNumber-b.episodeNumber);
}
function refreshDays(status,hasPlannedContinuation=false){
 return status==='Ended'&&!hasPlannedContinuation?90:7;
}
function isDue(checkedAt,now,days){
 const last=Date.parse(checkedAt),current=new Date(now).getTime();
 if(!Number.isFinite(last)||!Number.isFinite(current))throw Error('invalid refresh timestamp');
 return current>=last+days*DAY;
}
function normalizeSeasons(input){
 if(!Array.isArray(input))throw Error('invalid seasons list');
 const seen=new Set(),out=[];
 for(const s of input){
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('invalid season entry');
  const n=number(s.seasonNumber??s.season_number);
  if(n===null)throw Error('invalid season number');
  if(seen.has(n))throw Error('duplicate season number');
  seen.add(n);
  out.push({seasonNumber:n,name:str(s.name),episodeCount:number(s.episodeCount??s.episode_count),airDate:str(s.airDate??s.air_date,30),posterPath:str(s.posterPath??s.poster_path),episodes:normalizeEpisodes(s.episodes),episodesCheckedAt:s.episodesCheckedAt??null});
 }
 return out.sort((a,b)=>a.seasonNumber-b.seasonNumber);
}
function validate(record){
 exact(record,FIELDS);id(record.tvId);
 if(record.schemaVersion!==1)throw Error('invalid schema version');
 if(!Array.isArray(record.seasons))throw Error('invalid seasons');
 const seen=new Set();
 for(const s of record.seasons){exact(s,SEASON_FIELDS);if(!Number.isSafeInteger(s.seasonNumber)||s.seasonNumber<0||seen.has(s.seasonNumber))throw Error('invalid season number');seen.add(s.seasonNumber);if(s.episodes!==null){if(!Array.isArray(s.episodes))throw Error('invalid episodes');const nums=new Set();for(const e of s.episodes){exact(e,EPISODE_FIELDS);if(!Number.isSafeInteger(e.episodeNumber)||e.episodeNumber<1||nums.has(e.episodeNumber))throw Error('invalid episode');nums.add(e.episodeNumber);}}if(s.episodesCheckedAt!==null&&!Number.isFinite(Date.parse(s.episodesCheckedAt)))throw Error('invalid episode timestamp');}
 const created=Date.parse(record.createdAt),checked=Date.parse(record.checkedAt);
 if(!Number.isFinite(created)||!Number.isFinite(checked)||created>checked)throw Error('invalid timestamps');
 return record;
}
function makeRecord(tvId,seasons,at,previous=null){
 const stamp=new Date(at).toISOString();
 const record={tvId:id(tvId),seasons:normalizeSeasons(seasons),createdAt:previous?.createdAt||stamp,checkedAt:stamp,schemaVersion:1};
 return validate(record);
}
function toDetailEpisodes(record,seasonNumber){
 validate(record);
 const s=record.seasons.find(x=>x.seasonNumber===seasonNumber);
 if(!s||s.episodes===null)return null;
 return {season_number:s.seasonNumber,season_name:s.name,episodes:s.episodes.map(e=>({episode_number:e.episodeNumber,name:e.name,air_date:e.airDate,runtime:e.runtime}))};
}
function toDetailSeasons(record){
 validate(record);
 return record.seasons.filter(s=>s.seasonNumber>0).map(s=>({season_number:s.seasonNumber,name:s.name,episode_count:s.episodeCount,air_date:s.airDate,poster_path:s.posterPath}));
}
module.exports={normalizeSeasons,normalizeEpisodes,makeRecord,validate,toDetailSeasons,toDetailEpisodes,refreshDays,isDue};
