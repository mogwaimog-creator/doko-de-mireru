'use strict';
// Shared ledger presentation contract. Does not change existing page rendering.
// Page-specific additions never overwrite canonical metadata.
const {identity}=require('./_work-ledger');
const BASE=['type','id','title','originalTitle','releaseDate','posterPath','overview','directors','cast','runtimeMinutes'];
const PAGE_FIELDS={
  viewingOrder:['shortIntro','positionNote','trivia'],
  movieShelf:['awards','boxOffice','historicalContext','shelfIntro'],
  detail:['extendedIntro','relatedNote'],
  feature:['intro','notes']
};
function normalizeExtensions(value={}){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid extensions');
  const out={};
  for(const [page,fields] of Object.entries(value)){
    if(!Object.hasOwn(PAGE_FIELDS,page))throw new Error('Unknown page extension');
    if(!fields||typeof fields!=='object'||Array.isArray(fields))throw new Error('Invalid page fields');
    out[page]={};
    for(const [name,entry] of Object.entries(fields)){
      if(!PAGE_FIELDS[page].includes(name))throw new Error('Unknown extension field');
      if(typeof entry!=='string'||entry.length>10000)throw new Error('Invalid extension value');
      out[page][name]=entry;
    }
  }
  return out;
}
function selectForPage(work,page,extensions={},watch=null){
  if(!work||!PAGE_FIELDS[page])throw new Error('Invalid page selection');
  identity(work.type,work.id);
  const common=Object.fromEntries(BASE.map(k=>[k,work[k]??null]));
  const extra=normalizeExtensions(extensions)[page]||{};
  const result={...common,extra};
  if(page==='viewingOrder'){
    // Only flatrate is exposed here; rentals/purchases belong to detail.
    result.flatrate=Array.isArray(watch?.flatrate)?watch.flatrate:[];
  }else if(page==='detail'){
    result.watch=watch;
  }
  return result;
}
module.exports={BASE,PAGE_FIELDS,normalizeExtensions,selectForPage};
