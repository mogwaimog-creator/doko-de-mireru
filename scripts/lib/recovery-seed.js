'use strict';
// Exact, reviewed payloads only. Does not normalize/truncate editorial data.
const APPLY="local old=redis.call('MGET',unpack(KEYS));local pairs={};for i=1,#KEYS do if old[i] and old[i]~=ARGV[i] then return 0 end;pairs[#pairs+1]=KEYS[i];pairs[#pairs+1]=ARGV[i] end;redis.call('MSET',unpack(pairs));return 1";
async function seed(command,entries,{prefix,batchSize=32,maxBytes=20*1024*1024}={}){
 if(!/^doko:dev:seed:[a-z0-9:-]+:$/.test(prefix||'')||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>64||!Array.isArray(entries)||!entries.length||entries.length>5000)throw Error('bounded isolated seed required');
 const seen=new Set();let bytes=0;for(const row of entries){if(!/^(?:work:v2:(?:movie|tv):[1-9][0-9]*|shared-stream:v1:record:(?:movie|tv):[1-9][0-9]*|seo:v1:(?:movie|tv):[1-9][0-9]*|season:v1:tv:[1-9][0-9]*|person:v2:[1-9][0-9]*)$/.test(row.key)||seen.has(row.key)||typeof row.value!=='string')throw Error('invalid/duplicate seed key');JSON.parse(row.value);seen.add(row.key);bytes+=Buffer.byteLength(row.key)+Buffer.byteLength(row.value);if(bytes>maxBytes)throw Error('seed byte budget exceeded')}
 const batches=[];for(let i=0;i<entries.length;i+=batchSize)batches.push(entries.slice(i,i+batchSize));
 // Preflight every batch before first write. APPLY repeats the check atomically.
 for(const batch of batches){const old=await command(['MGET',...batch.map(x=>prefix+x.key)]);if(!Array.isArray(old)||old.length!==batch.length||old.some((value,i)=>value!==null&&value!==batch[i].value))throw Error('seed conflicts with saved protected data')}
 for(const batch of batches)if(Number(await command(['EVAL',APPLY,String(batch.length),...batch.map(x=>prefix+x.key),...batch.map(x=>x.value)]))!==1)throw Error('seed conflict during commit');
 for(const batch of batches){const saved=await command(['MGET',...batch.map(x=>prefix+x.key)]);if(saved.some((value,i)=>value!==batch[i].value))throw Error('seed verification failed')}
 return {records:entries.length,bytes,batches:batches.length,clientRedisRPCs:3*batches.length,serverOperationsIncludingLua:5*batches.length,indexOperations:0,notice:'exact supplied JSON retained; identity/schema/manual-field/source completeness must be separately audited before production'};
}
module.exports={seed,APPLY};
