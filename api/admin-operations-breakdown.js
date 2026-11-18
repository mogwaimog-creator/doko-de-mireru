'use strict';
// Read-only operator diagnostics. Uses the production release connection;
// no new Aiven connection, no scans, no writes, no TMDB requests.
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
  // Bounded, read-only inventory. Never return key names or record contents.
  let cursor='0',scanned=0,pages=0;
  const categories={work:0,streaming:0,person:0,season:0,operations:0,other:0};
  do{
   const reply=await command(['SCAN',cursor,'COUNT','100']);
   if(!Array.isArray(reply)||!Array.isArray(reply[1]))throw Error('invalid inventory scan');
   cursor=String(reply[0]);pages++;
   for(const key of reply[1]){
    scanned++;
    const category=key.startsWith('doko:dev:work:')||key.includes(':work:')?'work':
     key.startsWith('doko:dev:shared-stream:')||key.startsWith('doko:watch:')?'streaming':
     key.includes(':person:')?'person':
     key.includes(':season:')?'season':
     key.startsWith('doko:dev:ops:')||key.includes('acquisition-guard')?'operations':'other';
    categories[category]++;
   }
  }while(cursor!=='0'&&pages<10);
  const inventory={categories,keysSeen:scanned,scanPages:pages,complete:cursor==='0',
   note:cursor==='0'?'Completed bounded keyspace scan; counts are key counts, not record counts.':'Partial keyspace sample only; counts are NOT database totals.'};

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
