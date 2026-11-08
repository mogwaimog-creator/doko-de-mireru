'use strict';
// Development-only adapter. Not wired into production routes.
// Explicitly inject a Redis-compatible command function for demo tests.
const {normalizePerson,validateRecord}=require('../prototype/person-ledger');
const PREFIX='doko:person:v2:';
const SIXTY_DAYS=60*86400000;
function keyFor(id){const n=Number(id);if(!Number.isSafeInteger(n)||n<=0)throw Error('invalid person id');return PREFIX+n;}
function parseRecord(raw,id){
 if(!raw)return null;
 const record=typeof raw==='string'?JSON.parse(raw):raw;
 validateRecord(record);
 if(record.person.id!==Number(id))throw Error('person id mismatch');
 return record;
}
async function readPerson(command,id){
 return parseRecord(await command(['GET',keyFor(id)]),id);
}
function isFresh(record,now=Date.now()){
 return !!record&&now-Date.parse(record.checkedAt)<SIXTY_DAYS;
}
async function preparePerson({command,id,load,now=()=>Date.now(),allowWrites=false}){
 if(typeof command!=='function'||typeof load!=='function')throw Error('missing dependency');
 const existing=await readPerson(command,id);
 if(isFresh(existing,now()))return {person:existing.person,record:existing,source:'cache'};
 if(!allowWrites){
  if(existing)return {person:existing.person,record:existing,source:'stale-cache'};
  return {person:normalizePerson(await load()),record:null,source:'upstream-unsaved'};
 }
 // The live integration must add a distributed refresh lock before enabling writes.
 // This adapter deliberately refuses to write without a lock-bearing integration.
 throw Error('v2 write integration requires a distributed refresh lock');
}
module.exports={PREFIX,keyFor,parseRecord,readPerson,isFresh,preparePerson};
