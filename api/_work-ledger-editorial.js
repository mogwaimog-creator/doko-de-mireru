'use strict';
// Pure, offline-testable work-ledger editorial rules. No Redis/TMDB calls.
// All links point to canonical movie/tv + TMDB ID records; never embed copies.
const LINK_KINDS=new Set(['related','watchOrder','feature','collection']);
const FIELD_NAMES=new Set(['title','originalTitle','releaseDate','overview','runtimeMinutes','genres','posterPath','directors','cast','collectionId','status','voteAverage']);
function key(type,id){
 const n=Number(id);
 if(!['movie','tv'].includes(type)||!Number.isSafeInteger(n)||n<=0)throw new Error('Invalid linked work ID');
 return type+':'+n;
}
function normalizeLinks(value){
 if(value==null)return [];
 if(!Array.isArray(value)||value.length>300)throw new Error('Invalid work links');
 const seen=new Set();
 return value.map(link=>{
  if(!link||typeof link!=='object'||!LINK_KINDS.has(link.kind))throw new Error('Invalid work link kind');
  const id=Number(link.id),type=link.type;
  const target=key(type,id),scope=link.scope==null?null:String(link.scope);
  if(scope!=null&&!/^[a-zA-Z0-9_-]{1,80}$/.test(scope))throw new Error('Invalid link scope');
  const unique=link.kind+':'+(scope||'')+':'+target;
  if(seen.has(unique))return null;
  seen.add(unique);
  return {kind:link.kind,type,id,scope};
 }).filter(Boolean);
}
function normalizeEditorial(value){
 const src=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
 const confirmed=src.confirmed===true;
 const locks=src.locks&&typeof src.locks==='object'&&!Array.isArray(src.locks)?src.locks:{};
 const lockedFields=Object.keys(locks).filter(f=>FIELD_NAMES.has(f)&&locks[f]===true);
 const notes=typeof src.notes==='string'?src.notes.slice(0,1000):'';
 return {confirmed,lockedFields,notes};
}
function mergeAutomatic(existing,incoming){
 if(!existing||!incoming||existing.type!==incoming.type||Number(existing.id)!==Number(incoming.id))throw new Error('Work identity mismatch');
 const locked=new Set(normalizeEditorial(existing.editorial).lockedFields);
 // A confirmed record is protected from automatic replacement until manually reviewed.
 if(normalizeEditorial(existing.editorial).confirmed)return {...existing};
 const result={...existing};
 for(const field of FIELD_NAMES)if(!locked.has(field)&&Object.hasOwn(incoming,field))result[field]=incoming[field];
 return result;
}
function removalPlan(record){
 // Non-destructive report; never delete Redis data from this module.
 const fields=['extensions','seasons','backdropPath','voteCount','collectionName','checkedAt','nextCheckAt','manualReview','commonNotes'];
 return fields.filter(field=>Object.hasOwn(record||{},field)).map(field=>({
  field,
  action:field==='seasons'?'move-to-season-ledger-before-removal':'verify-no-readers-before-removal'
 }));
}
module.exports={key,normalizeLinks,normalizeEditorial,mergeAutomatic,removalPlan};
