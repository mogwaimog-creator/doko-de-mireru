'use strict';
// Bounded, process-local request coalescing while durable writes are frozen.
// No Redis writes. This cannot coordinate separate serverless workers.
function createFrozenLoader({ttlMs=30000,maxEntries=64,maxBytes=1024*1024,maxRecordBytes=128*1024,timeoutMs=8000,now=Date.now}={}){
 const entries=new Map();let bytes=0;
 function remove(k){const e=entries.get(k);if(e&&!e.pending){bytes-=e.bytes;entries.delete(k)}}
 function prune(){for(const [k,e] of entries)if(!e.pending&&e.until<=now())remove(k)}
 async function run(k,load){
  prune();const prior=entries.get(k);
  if(prior){if(prior.pending)return JSON.parse(await prior.pending);if(prior.error)throw prior.error;return JSON.parse(prior.json)}
  while(entries.size>=maxEntries){const victim=[...entries].find(([,e])=>!e.pending);if(!victim){const e=Error('Frozen lookup capacity busy');e.code='FROZEN_LOOKUP_BUSY';throw e}remove(victim[0])}
  const entry={bytes:0,pending:null};
  let timer;const controller=new AbortController();
  entry.pending=Promise.race([Promise.resolve().then(()=>load({signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();const e=Error('Frozen lookup timeout');e.code='FROZEN_LOOKUP_TIMEOUT';reject(e)},timeoutMs)})]).then(value=>{
   const json=JSON.stringify(value);if(json===undefined)throw Error('Invalid lookup response');const size=Buffer.byteLength(json);
   entry.pending=null;
   if(size>maxRecordBytes||size>maxBytes){entries.delete(k);return json}
   while(bytes+size>maxBytes){const victim=[...entries].find(([key,e])=>key!==k&&!e.pending);if(!victim)break;remove(victim[0])}
   if(bytes+size<=maxBytes){entry.json=json;entry.bytes=size;entry.until=now()+ttlMs;bytes+=size}else entries.delete(k);
   return json;
  }).catch(error=>{
   const safe=Error(String(error?.message||error).slice(0,500));if(error?.code)safe.code=String(error.code).slice(0,64);if(Number.isInteger(error?.httpStatus)&&error.httpStatus>=400&&error.httpStatus<=599)safe.httpStatus=error.httpStatus;
   entry.pending=null;entry.until=now()+ttlMs;entry.error=safe;
   const size=Buffer.byteLength(safe.message);
   while(bytes+size>maxBytes){const victim=[...entries].find(([key,e])=>key!==k&&!e.pending);if(!victim)break;remove(victim[0])}
   if(size<=maxBytes&&bytes+size<=maxBytes){entry.bytes=size;bytes+=size}else entries.delete(k);
   throw safe;
  }).finally(()=>clearTimeout(timer));
  entries.set(k,entry);return JSON.parse(await entry.pending);
 }
 return {run,clear(){entries.clear();bytes=0},stats:()=>({entries:entries.size,bytes})};
}
function verified(value,id,label='work',type){
 if(!Number.isSafeInteger(Number(id))||Number(id)<1||!value||typeof value!=='object'||Array.isArray(value)||Number(value.id)!==Number(id)||
 (type&&value.media_type&&value.media_type!==type))throw Error('Invalid '+label+' response');
 return value;
}
module.exports={createFrozenLoader,verified};
