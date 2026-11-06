'use strict';
// Work ledger v2: compact, metadata only. No Redis reads/writes or TMDB requests.
// Migration from v1 must be tested offline before switching production.
const SCHEMA_VERSION = 2;
const MAX_CAST = 8;
function obj(x){return x && typeof x==='object' && !Array.isArray(x) ? x : {};}
function str(x){return typeof x==='string' && x.trim() ? x.trim() : null;}
function num(x){return Number.isFinite(x) ? x : null;}
function identity(type,id){
  if(type!=='movie' && type!=='tv')throw new Error('Invalid work type');
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<=0)throw new Error('Invalid TMDB ID');
  return {type,id:n};
}
function person(x){const id=Number(x?.id);const name=str(x?.name);return Number.isSafeInteger(id)&&id>0&&name?{id,name}:null;}
function season(x){
  const number=Number(x?.seasonNumber);
  if(!Number.isSafeInteger(number)||number<0)return null;
  return {seasonNumber:number,name:str(x.name),episodeCount:num(x.episodeCount),airDate:str(x.airDate)};
}
function normalizeWorkV2(type,id,input){
  const key=identity(type,id),x=obj(input);
  const title=str(x.title);
  if(!title)throw new Error('Work title required');
  const result={
    schemaVersion:SCHEMA_VERSION,...key,title,
    originalTitle:str(x.originalTitle),releaseDate:str(x.releaseDate),
    posterPath:str(x.posterPath),overview:str(x.overview),
    runtimeMinutes:num(x.runtimeMinutes),
    genres:Array.isArray(x.genres)?x.genres.slice(0,20).map(g=>typeof g==='string'?g:str(g?.name)).filter(Boolean):[],
    director:person(x.director)||((Array.isArray(x.directors)?x.directors:[]).map(person).find(Boolean)||null),
    cast:(Array.isArray(x.cast)?x.cast:[]).map(person).filter(Boolean).slice(0,MAX_CAST),
    rating:num(x.rating??x.voteAverage),ratingCheckedAt:str(x.ratingCheckedAt),
    verification:{identity:str(x.verification?.identity)||'not_recorded',metadata:str(x.verification?.metadata)||'not_checked'},
    confirmed:x.confirmed===true||x.verification?.metadata==='confirmed',locked:x.locked===true||x.confirmed===true||x.verification?.metadata==='confirmed',
    pageExtras:obj(x.pageExtras)
  };
  if(type==='tv'){
    result.seasonCount=num(x.seasonCount);
    result.episodeCount=num(x.episodeCount);
    result.status=str(x.status);
    result.seasons=(Array.isArray(x.seasons)?x.seasons:[]).map(season).filter(Boolean);
  }
  if(Array.isArray(x.errors)&&x.errors.length)result.errors=x.errors;
  return result;
}
// Editorial updates are separate from automated metadata ingestion.
// A confirmed/locked record must never be overwritten by automation.
function acceptAutomaticUpdate(existing,candidate){
  if(existing?.locked||existing?.confirmed)return existing;
  if(!existing)return candidate;
  // Page-specific editorial text and verification must survive routine refreshes.
  return {...candidate,
    pageExtras:existing.pageExtras||{},
    verification:existing.verification||candidate.verification,
    errors:existing.errors||candidate.errors,
    confirmed:existing.confirmed===true,
    locked:existing.locked===true
  };
}
module.exports={SCHEMA_VERSION,identity,normalizeWorkV2,acceptAutomaticUpdate};
