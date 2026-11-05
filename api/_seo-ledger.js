'use strict';
// Explicit, opt-in SEO ledger operations. Not wired into visitor requests.
// No TMDB calls, key scans, automatic imports or background refresh.
const {command}=require('./_redis');
const {seoKey,compactSeo}=require('./_seo-ledger-record');
const MAX_VALUE_BYTES=1024;
function parseSeo(raw){
  if(!raw)return null;
  let value;
  try{value=typeof raw==='string'?JSON.parse(raw):raw;}catch{return null;}
  if(!value||value.v!==1||typeof value.t!=='string'||typeof value.d!=='string')return null;
  if(!value.t.trim()||!value.d.trim())return null;
  if(Buffer.byteLength(JSON.stringify(value),'utf8')>MAX_VALUE_BYTES)return null;
  return {title:value.t,description:value.d};
}
async function getSeo(kind,type,id){
  const raw=await command(['GET',seoKey(kind,type,id)]);
  return parseSeo(raw);
}
async function putSeo(kind,record){
  const entry=compactSeo(kind,record);
  if(Buffer.byteLength(entry.value,'utf8')>MAX_VALUE_BYTES)throw Error('SEO record exceeds size budget');
  // Overwrites the same identity key, never appends versions.
  const result=await command(['SET',entry.key,entry.value]);
  if(result!=='OK')throw Error('SEO ledger write failed');
  return {key:entry.key,bytes:Buffer.byteLength(entry.value,'utf8')};
}
module.exports={getSeo,putSeo,parseSeo,MAX_VALUE_BYTES};
