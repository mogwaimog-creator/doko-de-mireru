'use strict';
// Append-only anomaly records. Never rewrite canonical metadata automatically.
// Call only when a deliberate metadata recheck has already obtained a new value.
const {command}=require('./_redis');
const {identity}=require('./_work-ledger');
const crypto=require('node:crypto');
const FIELDS=['title','originalTitle','releaseDate','posterPath','directors','cast'];
const MAX_EVENTS=30;
const MAX_TEXT=350;
function clean(value){
 const str=JSON.stringify(value===undefined?null:value);
 return str.length>MAX_TEXT?str.slice(0,MAX_TEXT)+'…':str;
}
function differences(before,after){
 return FIELDS.filter(field=>clean(before?.[field])!==clean(after?.[field]))
  .map(field=>({field,previous:clean(before?.[field]),observed:clean(after?.[field])}));
}
function anomalyKey(type,id){return 'doko:work-anomalies:v1:'+identity(type,id).type+':'+identity(type,id).id;}
function fingerprint(changes){
 return crypto.createHash('sha256').update(JSON.stringify(changes)).digest('hex').slice(0,24);
}
async function recordAnomaly(type,id,before,after,context={}){
 const changes=differences(before,after);
 if(!changes.length)return {recorded:false,changes:[]};
 const key=anomalyKey(type,id);
 const hash=fingerprint(changes);
 const dedupKey=key+':seen:'+hash;
 // A repeated discrepancy is recorded at most once per 30 days.
 const claimed=await command(['SET',dedupKey,'1','EX',2592000,'NX']);
 if(claimed!=='OK')return {recorded:false,duplicate:true,changes};
 const event={
  detectedAt:new Date().toISOString(),type,id:Number(id),
  status:'pending_review',source:String(context.source||'metadata_recheck').slice(0,80),
  page:String(context.page||'unknown').slice(0,80),fingerprint:hash,changes
 };
 try{
  // Bounded history; these are separate commands, not an atomic transaction.
  await command(['LPUSH',key,JSON.stringify(event)]);
  await command(['LTRIM',key,'0',String(MAX_EVENTS-1)]);
 }catch(error){
  // Permit another attempt if the history write failed.
  await command(['DEL',dedupKey]).catch(()=>{});
  throw error;
 }
 return {recorded:true,changes,event};
}
async function listAnomalies(type,id){
 const key=anomalyKey(type,id);
 const result=await command(['LRANGE',key,'0',String(MAX_EVENTS-1)]);
 return (result||[]).map(raw=>typeof raw==='string'?JSON.parse(raw):raw);
}
module.exports={differences,recordAnomaly,listAnomalies,anomalyKey};
