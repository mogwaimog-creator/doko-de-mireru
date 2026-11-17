'use strict';
// Administrator-initiated, read-only Aiven diagnostics. Never invokes TMDB or the refresh job.
const {timingSafeEqual}=require('node:crypto');
function equalToken(value,expected){if(!expected||typeof expected!=='string')return false;const a=Buffer.from(String(value||'')),b=Buffer.from('Bearer '+expected);return a.length===b.length&&timingSafeEqual(a,b)}
function authorized(req,env){return equalToken(req.headers?.authorization,env.LEDGER_ADMIN_TOKEN)||equalToken(req.headers?.authorization,env.CRON_SECRET)}
function inspect(values,now=Date.now()){
 const [controlRaw,attemptRaw,successRaw]=values;
 const parse=raw=>{if(!raw)return null;try{return JSON.parse(raw)}catch{return {invalid:true}}};
 const control=parse(controlRaw),lastAttempt=parse(attemptRaw),lastSuccess=parse(successRaw);
 const day=new Date(now+9*3600000).toISOString().slice(0,10);
 return {checkedAt:new Date(now).toISOString(),day,controlStatus:control?.status||'missing',lastAttempt,lastSuccess,updatedToday:lastSuccess?.day===day};
}
async function diagnose(command,{now=Date.now}={}){
 // One bounded read, no SCAN, no writes, no provider fetch, no refresh.
 const keys=['doko:dev:content-control:v1','doko:dev:ops:v1:last-attempt','doko:dev:ops:v1:last-success'];
 const values=await command(['MGET',...keys]);
 if(!Array.isArray(values)||values.length!==3)throw Error('unexpected diagnostic response');
 return inspect(values,now());
}
async function handler(req,res,{env=process.env,command,now=Date.now}={}){
 res.setHeader('Cache-Control','private, no-store');res.setHeader('X-Robots-Tag','noindex');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 if(!authorized(req,env))return res.status(401).json({error:'unauthorized'});
 if(env.REDIS_PROVIDER!=='valkey'||!env.AIVEN_REDIS_URL)return res.status(503).json({error:'Aiven not configured'});
 try{
  const run=command||require('./_valkey').sharedValkey(env).command;
  const state=await diagnose(run,{now});
  return res.status(200).json({diagnostic:'aiven-read-only',...state,note:'Historical failures cannot be reconstructed when no diagnostic event was recorded. This check does not refresh streaming data.'});
 }catch{
  return res.status(503).json({diagnostic:'aiven-read-only',error:'Aiven read-only diagnostic failed',checkedAt:new Date(now()).toISOString()});
 }
}
module.exports=handler;module.exports._test={authorized,inspect,diagnose,handler};
