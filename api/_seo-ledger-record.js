'use strict';
// Compact, deterministic SEO ledger entries. No Redis writes or external API calls.
// Store only SEO-specific text; the canonical URL is derived from the existing work/person key.
const {workSeo,personSeo}=require('./_seo-initial-html');
const VERSION=1;
function seoKey(kind,type,id){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<=0||!/^[0-9]+$/.test(String(id)))throw Error('Invalid SEO id');
  if(kind==='work'&&['movie','tv'].includes(type))return 'doko:seo:v1:'+type+':'+n;
  if(kind==='person'&&(type===undefined||type===null))return 'doko:seo:v1:person:'+n;
  throw Error('Invalid SEO kind/type');
}
function compactSeo(kind,record){
  const seo=kind==='work'?workSeo(record):kind==='person'?personSeo(record):null;
  if(!seo)throw Error('Invalid SEO kind');
  const type=kind==='work'?record.type:null;
  return {
    key:seoKey(kind,type,record.id),
    value:JSON.stringify({v:VERSION,t:seo.title,d:seo.description})
  };
}
module.exports={seoKey,compactSeo};
