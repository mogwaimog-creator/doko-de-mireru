'use strict';
// Offline-only season ledger foundation. Does not access TMDB, Redis, or live routes.
const FIELDS=['tvId','seasons','createdAt','checkedAt','schemaVersion'];
const SEASON_FIELDS=['seasonNumber','name','episodeCount','airDate','posterPath'];
function id(v){const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw Error('invalid TV ID');return n;}
function number(v){const n=Number(v);return Number.isSafeInteger(n)&&n>=0?n:null;}
function str(v,max=200){return typeof v==='string'?v.slice(0,max):null;}
function exact(o,keys){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).some(k=>!keys.includes(k))||keys.some(k=>!Object.hasOwn(o,k)))throw Error('unexpected season ledger fields');}
function normalizeSeasons(input){
 if(!Array.isArray(input))throw Error('invalid seasons list');
 const seen=new Set(),out=[];
 for(const s of input){
  if(!s||typeof s!=='object'||Array.isArray(s))throw Error('invalid season entry');
  const n=number(s.seasonNumber??s.season_number);
  if(n===null)throw Error('invalid season number');
  if(seen.has(n))throw Error('duplicate season number');
  seen.add(n);
  out.push({seasonNumber:n,name:str(s.name),episodeCount:number(s.episodeCount??s.episode_count),airDate:str(s.airDate??s.air_date,30),posterPath:str(s.posterPath??s.poster_path)});
 }
 return out.sort((a,b)=>a.seasonNumber-b.seasonNumber);
}
function validate(record){
 exact(record,FIELDS);id(record.tvId);
 if(record.schemaVersion!==1)throw Error('invalid schema version');
 if(!Array.isArray(record.seasons))throw Error('invalid seasons');
 const seen=new Set();
 for(const s of record.seasons){exact(s,SEASON_FIELDS);if(!Number.isSafeInteger(s.seasonNumber)||s.seasonNumber<0||seen.has(s.seasonNumber))throw Error('invalid season number');seen.add(s.seasonNumber);}
 const created=Date.parse(record.createdAt),checked=Date.parse(record.checkedAt);
 if(!Number.isFinite(created)||!Number.isFinite(checked)||created>checked)throw Error('invalid timestamps');
 return record;
}
function makeRecord(tvId,seasons,at,previous=null){
 const stamp=new Date(at).toISOString();
 const record={tvId:id(tvId),seasons:normalizeSeasons(seasons),createdAt:previous?.createdAt||stamp,checkedAt:stamp,schemaVersion:1};
 return validate(record);
}
function toDetailSeasons(record){
 validate(record);
 return record.seasons.filter(s=>s.seasonNumber>0).map(s=>({season_number:s.seasonNumber,name:s.name,episode_count:s.episodeCount,air_date:s.airDate,poster_path:s.posterPath}));
}
module.exports={normalizeSeasons,makeRecord,validate,toDetailSeasons};
