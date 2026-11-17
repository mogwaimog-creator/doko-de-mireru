'use strict';
// Explicit administrator recovery, separate from the 06:00 schedule and read-only diagnostics.
// Reuses the existing update handler, its lease, retry limits and preservation rules.
const {timingSafeEqual}=require('node:crypto');
function authorized(req,env){
 const token=env.LEDGER_ADMIN_TOKEN;
 if(typeof token!=='string'||token.length<32)return false;
 const a=Buffer.from(String(req.headers?.authorization||'')),b=Buffer.from('Bearer '+token);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function handler(req,res,{env=process.env,run}={}){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex');
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 if(!authorized(req,env))return res.status(401).json({error:'unauthorized'});
 if(req.headers?.['x-confirm-cron-run']!=='run-once')return res.status(400).json({error:'explicit run-once confirmation required'});
 if(env.REDIS_PROVIDER!=='valkey'||!env.AIVEN_REDIS_URL||env.LEDGER_RELEASE_MODE!=='new')return res.status(503).json({error:'Aiven release mode not ready'});
 // No automatic retry. The existing scheduler decides whether today is already complete.
 console.info('STREAMING_CRON_MANUAL_TRIGGER',JSON.stringify({source:'admin',at:new Date().toISOString()}));
 const invoke=run||require('./update-streaming');
 const forwarded={...req,method:'GET',headers:{...req.headers,authorization:'Bearer '+env.CRON_SECRET}};
 return invoke(forwarded,res);
}
module.exports=handler;
module.exports._test={authorized,handler};
