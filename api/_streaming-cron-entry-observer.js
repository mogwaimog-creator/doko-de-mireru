'use strict';
// Logs only dispatch failures; inner scheduler observer owns successful runs.
// No storage reads/writes or network calls.
async function observeDispatch(run,{log=console.info}={}){
 try{return await run()}catch(error){
  // Preserve thrown errors and let the existing dispatch error handler respond.
  try{log('STREAMING_CRON_DISPATCH_DIAGNOSTIC',JSON.stringify({event:'exception',code:'DISPATCH_EXCEPTION'}))}catch{}
  throw error;
 }
}
function recordPreflightFailure(name,error,{log=console.info}={}){
 if(name!=='update-streaming')return;
 try{log('STREAMING_CRON_DISPATCH_DIAGNOSTIC',JSON.stringify({event:'failed',code:'DISPATCH_PREFLIGHT_FAILED'}))}catch{}
}
function recordAuthFailure({log=console.info}={}){
 try{log('STREAMING_CRON_DISPATCH_DIAGNOSTIC',JSON.stringify({event:'rejected',code:'CRON_UNAUTHORIZED'}))}catch{}
}
module.exports={observeDispatch,recordPreflightFailure,recordAuthFailure};
