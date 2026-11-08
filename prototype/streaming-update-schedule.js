'use strict';
// Pure scheduling decision for the NEW shared streaming ledger (not the legacy cache).
// This function never performs a network call or writes to storage.
const DAY=86400000;
function jstDay(ms){return new Date(ms+9*3600000).toISOString().slice(0,10)}
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
 if(!Number.isFinite(last))return {due:true,reason:'never-succeeded'};
 return now-last>=DAY?{due:true,reason:'24h-after-success'}:{due:false,reason:'fresh'};
}
module.exports={decide,jstDay};
