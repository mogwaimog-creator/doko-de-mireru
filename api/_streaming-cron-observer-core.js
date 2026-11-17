'use strict';
// Diagnostic only: no Redis commands or upstream requests.
const ALLOWED=new Set(['complete','complete-with-errors','busy','stopped','paused','not-due']);
function classify(result){
 if(!result||!ALLOWED.has(result.status))return 'UNEXPECTED_RESULT';
 if(result.status==='complete')return 'COMPLETE';
 if(result.status==='complete-with-errors')return 'PARTIAL_FAILURE';
 if(result.status==='not-due')return 'BEFORE_WINDOW';
 if(result.status==='paused')return 'RUN_PAUSED';
 if(result.status==='busy')return result.reason==='work-busy'?'WORK_LEASE_BUSY':'SERIES_LEASE_BUSY';
 const reasons={'shared-pause':'CONTROL_PAUSED',paused:'CONTROL_PAUSED','run-budget':'RUN_BUDGET','storage-or-journal-error':'STORAGE_OR_JOURNAL_ERROR'};
 return reasons[result.reason]||'STOPPED_OTHER';
}
const SAFE_ERROR_CODES=new Set(['WORK_ACQUISITION_STOPPED','STORAGE_FAILURE','SETUP_FAILED','ECONNREFUSED','ETIMEDOUT','ECONNRESET','ENOTFOUND','EAI_AGAIN']);
function safeError(error){const code=error?.code;return typeof code==='string'&&SAFE_ERROR_CODES.has(code)?code:'UNKNOWN'}
function observer({clock=Date.now,emit=()=>{}}={}){
 if(typeof clock!=='function'||typeof emit!=='function')throw Error('invalid observer');
 return async run=>{
  if(typeof run!=='function')throw Error('runner required');
  const started=clock(),send=event=>{try{emit(Object.freeze(event))}catch{}};
  send({stage:'cron',event:'started',at:new Date(started).toISOString()});
  try{
   const result=await run();
   send({stage:'cron',event:'finished',at:new Date(clock()).toISOString(),elapsedMs:Math.max(0,clock()-started),code:classify(result),status:ALLOWED.has(result?.status)?result.status:'unknown',succeeded:Number.isSafeInteger(result?.succeeded)?result.succeeded:null,failed:Number.isSafeInteger(result?.failed)?result.failed:null,pending:Number.isSafeInteger(result?.pending)?result.pending:null});
   return result;
  }catch(error){send({stage:'cron',event:'failed',at:new Date(clock()).toISOString(),elapsedMs:Math.max(0,clock()-started),code:safeError(error)});throw error}
 };
}
module.exports={observer,classify,safeError};
