'use strict';
// Read-only operator diagnostics. Uses the production release connection;
// no new Aiven connection, no writes, no TMDB requests.
const {timingSafeEqual}=require('node:crypto');
function authorized(header,secret){
 if(typeof secret!=='string'||secret.length<32||typeof header!=='string')return false;
 const a=Buffer.from(header),b=Buffer.from('Bearer '+secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
function decode(raw){if(!raw)return null;try{return JSON.parse(raw)}catch{return {error:'invalid-record'}}}
module.exports=async function operatorBreakdown(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Robots-Tag','noindex');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 if(!authorized(req.headers?.authorization,process.env.LEDGER_ADMIN_TOKEN))return res.status(401).json({error:'Unauthorized'});
 try{
  const {command}=require('./_release-connection').connect();
  const keys=[
   'doko:dev:ops:v1:last-attempt',
   'doko:dev:ops:v1:last-success',
   'doko:dev:acquisition-guard:v2',
   'doko:dev:content-control:v1'
  ];
  const values=await command(['MGET',...keys]);
  const [lastAttempt,lastSuccess,guard,control]=values.map(decode);
  // The release transport deliberately forbids SCAN/DBSIZE. Count only
  // the fixed 13-series roster via bounded MGET; never claim DB totals.
  const roster=require('../scripts/lib/cutover/package').roster;
  const workKeys=roster.map(w=>'doko:dev:work:v2:'+w.type+':'+w.id);
  const streamKeys=roster.map(w=>'doko:dev:shared-stream:v1:record:'+w.type+':'+w.id);
  const countExisting=async keys=>{
   let found=0;
   for(let i=0;i<keys.length;i+=32){
    const batch=await command(['MGET',...keys.slice(i,i+32)]);
    if(!Array.isArray(batch))throw Error('invalid inventory batch');
    found+=batch.filter(v=>v!==null&&v!==false).length;
   }
   return found;
  };
  const inventory={
   scope:'13-series roster only; NOT total Aiven database contents',
   worksInRoster:roster.length,
   storedWorks:await countExisting(workKeys),
   storedStreaming:await countExisting(streamKeys),
   databaseTotal:null
  };

  const day=new Date(Date.now()+9*3600000).toISOString().slice(0,10);
  return res.status(200).json({
   at:new Date().toISOString(),dayJst:day,
   connection:{configuredProvider:process.env.REDIS_PROVIDER||'upstash',read:'ok'},
   streaming:{lastAttempt,lastSuccess},inventory,
   acquisition:{
    guardDay:guard?.day||null,
    regularAttempts:guard?.daily??null,
    scheduledStreamingAttempts:guard?.dailyScheduled??null,
    regularMinute:guard?.acquisitions??null,
    scheduledMinute:guard?.scheduled??null,
    failuresThisMinute:guard?.failures??null
   },
   control:{status:control?.status||'unknown'},
   limitations:'Application counters are not Aiven-wide command totals; historical per-command breakdown is not stored.'
  });
 }catch(error){
  console.error('OPERATOR_BREAKDOWN_FAILED',{code:error?.code||'UNKNOWN'});
  return res.status(503).json({error:'Diagnostic read failed'});
 }
};
module.exports._test={authorized,decode};
