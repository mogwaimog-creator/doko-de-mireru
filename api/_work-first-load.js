'use strict';
// Prevent a cache stampede for a first-time work lookup. No background polling.
const {command}=require('./_redis');
const {identity,getWork}=require('./_work-ledger');
const WAIT_MS=2500, STEP_MS=100, LOCK_SECONDS=8;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function firstWorkLoad(type,id,load){
 const {key}=identity(type,id);
 const lockKey=key+':initial-load-lock';
 const token=require('node:crypto').randomUUID();
 let acquired;
 try{acquired=await command(['SET',lockKey,token,'EX',String(LOCK_SECONDS),'NX']);}
 catch(error){console.error('WORK LOCK ACQUIRE FAILED',error);return load();}
 if(acquired==='OK'){
  try{return await load();}
  finally{
   // Never delete another worker's lock after ours has expired.
   const script='if redis.call("GET",KEYS[1])==ARGV[1] then return redis.call("DEL",KEYS[1]) else return 0 end';
   await command(['EVAL',script,'1',lockKey,token]).catch(error=>console.error('WORK LOCK RELEASE FAILED',error));
  }
 }
 const deadline=Date.now()+WAIT_MS;
 while(Date.now()<deadline){
  await sleep(Math.min(STEP_MS,Math.max(0,deadline-Date.now())));
  let saved;
  try{saved=await getWork(type,id);}
  catch(error){console.error('WORK LOCK WAIT READ FAILED',error);return load();}
  if(saved?.extensions?.tmdbDetail)return saved.extensions.tmdbDetail;
 }
 // A busy work should not cause every waiting visitor to hit TMDB.
 const error=new Error('Work metadata is temporarily busy');
 error.code='WORK_METADATA_BUSY';
 throw error;
}
module.exports={firstWorkLoad};
