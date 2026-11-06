'use strict';
// One record per TMDB person. Store the already-normalized response, including
// compact credits cards, without fetching each work's detail separately.
const {command}=require('./_redis');
const {randomUUID}=require('node:crypto');
const PREFIX='doko:person:v1:';
const TWO_MONTHS_MS=60*24*60*60*1000;
const LOCK_SECONDS=30;
const WAIT_MS=7000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function personKey(id){
  const n=Number(id);
  if(!Number.isSafeInteger(n)||n<=0)throw new Error('Invalid person ID');
  return PREFIX+n;
}
async function read(key,id){
  const raw=await command(['GET',key]);
  if(!raw)return null;
  const value=typeof raw==='string'?JSON.parse(raw):raw;
  if(!value||value.schemaVersion!==1||Number(value.person?.id)!==Number(id))return null;
  return value;
}
// Remove only redundant credit-card fields; preserve profile-level metadata.
function compactPerson(person){
  const lists=['cast','voice','directed','documentary_talk','other'];
  const result={...person};
  for(const name of lists){
    if(!Array.isArray(person[name]))continue;
    result[name]=person[name].map(work=>{
      if(!work||typeof work!=='object'||Array.isArray(work))return work;
      const {overview,original_title,popularity,vote_average,...retained}=work;
      return retained;
    });
  }
  return result;
}
async function withPersonLedger(id,load){
  if(process.env.WORK_LEDGER_ENABLED!=='1')return load();
  const key=personKey(id);
  let existing=await read(key,id);
  // Emergency storage freeze: keep reading saved records, but never create or refresh person records.
  if(process.env.LEDGER_WRITES_RESUME!=='1')return existing?existing.person:load();
  if(existing&&Date.now()-Date.parse(existing.checkedAt)<TWO_MONTHS_MS)return existing.person;
  const lockKey=key+':refresh-lock',token=randomUUID();
  const locked=await command(['SET',lockKey,token,'EX',String(LOCK_SECONDS),'NX']);
  if(locked!=='OK'){
    // For refreshes, serve the saved list while another request updates it.
    if(existing)return existing.person;
    const deadline=Date.now()+WAIT_MS;
    while(Date.now()<deadline){
      await sleep(100);
      const found=await read(key,id);
      if(found)return found.person;
    }
    const err=new Error('Person metadata is temporarily busy');
    err.code='PERSON_METADATA_BUSY';
    throw err;
  }
  try{
    // Re-check after lock to avoid redundant upstream requests.
    const latest=await read(key,id);
    if(latest&&Date.now()-Date.parse(latest.checkedAt)<TWO_MONTHS_MS)return latest.person;
    existing=latest||existing;
    try{
      const person=await load();
      if(!person||Number(person.id)!==Number(id))throw new Error('Invalid person response');
      const compacted=compactPerson(person);
      const record={schemaVersion:1,checkedAt:new Date().toISOString(),person:compacted};
      await command(['SET',key,JSON.stringify(record)]);
      return compacted;
    }catch(error){
      // Preserve the last successful data if TMDB is temporarily unavailable.
      if(existing){console.error('PERSON LEDGER REFRESH FAILED',error);return existing.person;}
      throw error;
    }
  }finally{
    const script='if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end';
    await command(['EVAL',script,'1',lockKey,token]).catch(e=>console.error('PERSON LOCK RELEASE FAILED',e));
  }
}
module.exports={withPersonLedger};
