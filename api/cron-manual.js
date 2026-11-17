'use strict';
// Manual maintenance entry point. Not scheduled by Vercel.
// GET: safe preflight without database or TMDB traffic.
// POST: explicitly run the same authenticated production Cron handler once.
const {timingSafeEqual}=require('node:crypto');
function authorized(req){
 const secret=process.env.CRON_SECRET;
 if(!secret)return false;
 const supplied=Buffer.from(String(req.headers?.authorization||''));
 const expected=Buffer.from('Bearer '+secret);
 return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex');
 if(!authorized(req))return res.status(401).json({error:'unauthorized'});
 if(req.method==='GET')return res.status(200).json({
  diagnostic:'manual-cron-entry',
  releaseMode:process.env.LEDGER_RELEASE_MODE||'legacy',
  cronConfigured:!!process.env.CRON_SECRET,
  aivenConfigured:!!process.env.AIVEN_REDIS_URL,
  tmdbConfigured:!!process.env.TMDB_API_KEY,
  note:'Preflight only: no database connection, write, or TMDB request performed'
 });
 if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
 // Explicit opt-in required to prevent accidental refresh from a generic POST.
 if(req.headers['x-confirm-cron-run']!=='run-once')return res.status(400).json({error:'x-confirm-cron-run: run-once required'});
 console.info('STREAMING_CRON_MANUAL_TRIGGER',{source:'admin',at:new Date().toISOString()});
 req.method='GET'; // Existing handler accepts GET and performs its own auth and locking.
 return require('./update-streaming')(req,res);
};
