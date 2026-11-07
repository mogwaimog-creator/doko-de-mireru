'use strict';
// Isolated season refresh lock adapter. Not wired to production.
// Redis commands are dependency-injected; no network on import.
const {randomUUID}=require('node:crypto');
const {key,decode,compactRecord}=require('./_season-ledger-redis');
const {assertSeasonWritesAllowed}=require('./_season-write-guard');
const {seasonRefreshDue}=require('./_season-refresh-policy');
const UNLOCK='if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end';
function createSeasonRefreshWriter(command,{now=()=>Date.now(),token=()=>randomUUID()}={}){
 if(typeof command!=='function')throw Error('Redis command required');
 return async function refreshRecord(saved,load){
  if(!saved||typeof load!=='function')throw Error('Invalid refresh request');
  const dataKey=key(saved.type,saved.id,saved.seasonNumber);
  assertSeasonWritesAllowed();
  const lockKey=dataKey+':refresh-lock',owner=token();
  const locked=await command(['SET',lockKey,owner,'EX','30','NX']);
  if(locked!=='OK')return null;
  try{
   assertSeasonWritesAllowed();
   const raw=await command(['GET',dataKey]);
   const current=decode(raw,saved.type,saved.id,saved.seasonNumber);
   if(!current)return null; // Do not recreate a deleted record.
   if(!seasonRefreshDue({checkedAt:current.checkedAt,status:current.status,now:now()}))
    return current;
   const next=await load();
   if(!next||next.type!==current.type||next.id!==current.id||
    next.seasonNumber!==current.seasonNumber||!Array.isArray(next.episodes))
    throw Error('Invalid refreshed season');
   assertSeasonWritesAllowed();
   // Lock ownership is checked atomically with write. Never overwrite after lock expiry.
   const script='if redis.call("GET",KEYS[2])==ARGV[1] then return redis.call("SET",KEYS[1],ARGV[2]) else return nil end';
   const written=await command(['EVAL',script,'2',dataKey,lockKey,owner,JSON.stringify(compactRecord(next))]);
   return written==='OK'?compactRecord(next):null;
  }finally{
   await command(['EVAL',UNLOCK,'1',lockKey,owner]);
  }
 };
}
module.exports={createSeasonRefreshWriter};
