'use strict';
// Administrator-only manual entry to the existing scheduled streaming update.
// This does not create a second scheduler, bypass acquisition limits, or alter ledgers.
const {timingSafeEqual}=require('node:crypto');
function validBearer(header,secret){
 if(typeof secret!=='string'||secret.length<32||typeof header!=='string')return false;
 const a=Buffer.from(header),b=Buffer.from('Bearer '+secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
module.exports=async function emergencyStreaming(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex');
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 if(!validBearer(req.headers.authorization,process.env.LEDGER_ADMIN_TOKEN))return res.status(401).json({error:'Unauthorized'});
 if(!process.env.CRON_SECRET)return res.status(503).json({error:'Cron is not configured'});
 // Reuse the production Cron route, including its authentication, locks,
 // scheduled quota, existing daily progress and result response.
 const cronReq=Object.create(req);
 cronReq.method='GET';
 cronReq.headers={...req.headers,authorization:'Bearer '+process.env.CRON_SECRET};
 return require('./update-streaming')(cronReq,res);
};
module.exports._test={validBearer};
