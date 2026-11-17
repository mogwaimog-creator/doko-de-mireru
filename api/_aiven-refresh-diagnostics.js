'use strict';
// Pure, credential-free classification for the Aiven refresh path.
// A missing Cron invocation cannot be inferred from an application exception.
const STAGES=new Set(['entry','auth','aiven-connect','tmdb-fetch','aiven-save','complete']);
const CODES=new Set(['ECONNREFUSED','ETIMEDOUT','ECONNRESET','ENOTFOUND','EAI_AGAIN','WRONGPASS','NOAUTH']);
function classifyFailure(stage,error){
 if(!STAGES.has(stage))throw Error('unknown diagnostic stage');
 const raw=error&&typeof error.code==='string'?error.code:'';
 const code=CODES.has(raw)?raw:'UNKNOWN';
 const category=stage==='auth'?'AUTH_FAILURE':stage==='aiven-connect'?'AIVEN_CONNECTION_FAILURE':stage==='tmdb-fetch'?'TMDB_FETCH_FAILURE':stage==='aiven-save'?'AIVEN_SAVE_FAILURE':stage==='entry'?'ENTRY_FAILURE':'UNEXPECTED_FAILURE';
 return Object.freeze({stage,category,code});
}
function recordStage(stage,{clock=Date.now,emit=console.info}={}){
 if(!STAGES.has(stage))throw Error('unknown diagnostic stage');
 const event=Object.freeze({stage,event:'entered',at:new Date(clock()).toISOString()});
 try{emit('STREAMING_CRON_STAGE',JSON.stringify(event))}catch{}
 return event;
}
module.exports={classifyFailure,recordStage};
