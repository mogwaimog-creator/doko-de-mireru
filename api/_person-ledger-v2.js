'use strict';
// Staged v2 person ledger. Not wired into live routes. Dependency-injected Redis.
const {normalizePerson,validateRecord}=require('../prototype/person-ledger');
const {randomUUID}=require('node:crypto');
const PREFIX='doko:person:v2:';
const SIXTY_DAYS=60*86400000;
const LOCK_SECONDS=30;
const WAIT_MS=7000;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function keyFor(id){const n=Number(id);if(!Number.isSafeInteger(n)||n<=0)throw Error('invalid person id');return PREFIX+n;}
function parseRecord(raw,id){
 if(!raw)return null;
 const record=typeof raw==='string'?JSON.parse(raw):raw;
 validateRecord(record);
 if(record.person.id!==Number(id))throw Error('person id mismatch');
 return record;
}
async function readPerson(command,id){return parseRecord(await command(['GET',keyFor(id)]),id);}
function isFresh(record,now=Date.now()){return !!record&&now-Date.parse(record.checkedAt)<SIXTY_DAYS;}
function makeRecord(person,previous,time){
 const stamp=new Date(time).toISOString();
 const record={schemaVersion:2,person:normalizePerson(person),createdAt:previous?.createdAt||stamp,checkedAt:stamp};
 return validateRecord(record);
}
async function preparePerson({command,id,load,now=()=>Date.now(),allowWrites=false}){
 if(typeof command!=='function'||typeof load!=='function')throw Error('missing dependency');
 const key=keyFor(id);
 let existing=await readPerson(command,id);
 if(isFresh(existing,now()))return {person:existing.person,record:existing,source:'cache'};
 if(!allowWrites){
  if(existing)return {person:existing.person,record:existing,source:'stale-cache'};
  const person=normalizePerson(await load());
  if(person.id!==Number(id))throw Error('person id mismatch');
  return {person,record:null,source:'upstream-unsaved'};
 }
 const lockKey=key+':refresh-lock',token=randomUUID();
 const locked=await command(['SET',lockKey,token,'EX',String(LOCK_SECONDS),'NX']);
 if(locked!=='OK'){
  if(existing)return {person:existing.person,record:existing,source:'stale-cache'};
  const deadline=Date.now()+WAIT_MS;
  while(Date.now()<deadline){
   await sleep(100);
   const found=await readPerson(command,id);
   if(found)return {person:found.person,record:found,source:'cache'};
  }
  const error=new Error('Person ledger busy');error.code='PERSON_METADATA_BUSY';throw error;
 }
 try{
  const latest=await readPerson(command,id);
  if(isFresh(latest,now()))return {person:latest.person,record:latest,source:'cache'};
  existing=latest||existing;
  try{
   const fetched=await load();
   const person=normalizePerson(fetched);
   if(person.id!==Number(id))throw Error('person id mismatch');
   const stamp=now();
   const record=makeRecord(person,existing,stamp);
   // Reuse the existing record on identical content, updating only the check date.
   // A Redis hash is deliberately avoided: one strict JSON record per person.
   await command(['SET',key,JSON.stringify(record)]);
   return {person:record.person,record,source:existing?'refreshed':'created'};
  }catch(error){
   if(existing)return {person:existing.person,record:existing,source:'stale-cache'};
   throw error;
  }
 }finally{
  const script='if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end';
  await command(['EVAL',script,'1',lockKey,token]).catch(()=>{});
 }
}
module.exports={PREFIX,keyFor,parseRecord,readPerson,isFresh,makeRecord,preparePerson};
