'use strict';
// Pure scheduling decision for the NEW shared streaming ledger (not the legacy cache).
// This function never performs a network call or writes to storage.
const DAY=86400000;
function jstDay(ms){return new Date(ms+9*3600000).toISOString().slice(0,10)}
const RETRY_MS=30*60000;
function decide(record,{at,watchOrder=false,scheduled=false}={}){
 const now=Date.parse(at);
 if(!Number.isFinite(now))throw Error('invalid time');
 if(!record)throw Error('missing record');
 if(watchOrder){
  if(!scheduled)return {due:false,reason:'scheduled-only'};
  const local=new Date(now+9*3600000);
  if(local.getUTCHours()<6)return {due:false,reason:'before-06-jst'};
  if(record.lastSeriesRunDay===jstDay(now))return {due:false,reason:'already-attempted-today'};
  return {due:true,reason:'daily-06-jst',runDay:jstDay(now)};
 }
 const last=record.lastSuccessAt?Date.parse(record.lastSuccessAt):NaN;
 if(Number.isFinite(last)&&now-last<DAY)return {due:false,reason:'fresh'};
 // Only throttle when the latest attempt failed after the last success.
 // Do not let a failed refresh overwrite lastSuccessAt or nextEligibleAt.
 const attempted=record.lastAttemptAt?Date.parse(record.lastAttemptAt):NaN;
 if(Number.isFinite(attempted)&&attempted<=now&&(!Number.isFinite(last)||attempted>last||(attempted===last&&(Array.isArray(record.errors)&&record.errors.some(e=>e.status==='open'))))&&now-attempted<RETRY_MS)
  return {due:false,reason:'retry-cooldown',retryAt:new Date(attempted+RETRY_MS).toISOString()};
 return {due:true,reason:Number.isFinite(last)?'24h-after-success':'never-succeeded'};
}

module.exports={decide,jstDay,RETRY_MS};
