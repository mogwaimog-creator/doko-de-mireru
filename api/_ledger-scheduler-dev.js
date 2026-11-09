'use strict';
// Adapter for the existing authenticated cron shape, with local-only dependencies.
const {supervisor}=require('./_daily-job-supervisor'),{jstDay}=require('../prototype/streaming-ledger-schedule');
const ROOT='doko:dev:ops:v1:';
function scheduler(command,job,{controlKey='doko:dev:content-control:v1',prefix=ROOT,clock=Date.now,lean=false}={}){
 if(!/^doko:dev:[a-z0-9:-]+$/.test(controlKey)||!/^doko:dev:[a-z0-9:-]+:$/.test(prefix))throw Error('local control required');
 async function run(works,{signal}={}){
  const at=new Date(clock()).toISOString(),day=jstDay(at),control=await command(['GET',controlKey]);let result;
  if(control&&JSON.parse(control).status!=='ready')result={status:'stopped',reason:'shared-pause'};
  else if(lean){try{const last=await job.run(at,works,{maxItems:1000,signal});result={...last,last};if(!['complete','complete-with-errors','not-due','busy'].includes(result.status))result={...result,status:'stopped'}}catch{result={status:'stopped',reason:'storage-or-journal-error'}}}
  else result=await supervisor(job).run(at,works,{maxItems:24,signal});
  const event={day,at,status:result.status,reason:result.reason||null,last:result.last||null};
  const writes=[prefix+'last-attempt',JSON.stringify(event)];if(result.status==='complete')writes.push(prefix+'last-success',JSON.stringify(event));
  if(['stopped','complete-with-errors'].includes(result.status)){
   // Dedupe per day/status; bounded outbox, no external messages.
   const marker=prefix+'notified:'+day+':'+result.status;
   const sequence=await command(['INCR',prefix+'sequence']),alertKey=prefix+'alert:'+String(sequence%16),alert=JSON.stringify({...event,sequence});
   const script="local pairs={};for i=2,#KEYS-1 do pairs[#pairs+1]=KEYS[i];pairs[#pairs+1]=ARGV[i-1] end;if redis.call('EXISTS',KEYS[1])==0 then pairs[#pairs+1]=KEYS[#KEYS];pairs[#pairs+1]=ARGV[#ARGV];pairs[#pairs+1]=KEYS[1];pairs[#pairs+1]='1';redis.call('MSET',unpack(pairs));redis.call('EXPIRE',KEYS[1],1209600);redis.call('EXPIRE',KEYS[#KEYS],1209600) else redis.call('MSET',unpack(pairs)) end;return 1";
   await command(['EVAL',script,String(writes.length/2+2),marker,...writes.filter((_,i)=>i%2===0),alertKey,...writes.filter((_,i)=>i%2===1),alert]);return event;
  }
  await command(['MSET',...writes]);return event;
 }
 async function health(){const raw=await command(['MGET',prefix+'last-attempt',prefix+'last-success',controlKey]),decode=x=>x===null?null:JSON.parse(x),[lastAttempt,lastSuccess,control]=raw.map(decode),at=new Date(clock()).toISOString(),day=jstDay(at),late=clock()>=Date.parse(day+'T07:00:00+09:00');return {day,control,lastAttempt,lastSuccess,overdue:late&&lastSuccess?.day!==day,notification:'local outbox only; no external delivery'}}
 return {run,health};
}
async function handle(req,res){
 if(process.env.DEV_SHARED_CRON_ENABLED!=='1'||process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')return res.status(404).json({error:'isolated cron disabled'});
 const {command}=require('../tests/helpers/local-redis'),{sharedStore}=require('./_shared-streaming-store'),{compactDailyJobStore}=require('./_compact-daily-job-store'),{dailyJob}=require('./_streaming-daily-job');
 const works=require('../scripts/audit-shared-ledgers').inventory().records;
 const fixture={results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix（隔離試験用）',logo_path:'/test-fixture.png'}],rent:[],buy:[]}}};
 try{const lean=process.env.DEV_LEAN_SERIES_ENABLED==='1';const job=lean?require('./_lean-series-refresh').leanSeriesRefresh(command,async()=>fixture):dailyJob(sharedStore(command),compactDailyJobStore(command),async()=>fixture);const runner=scheduler(command,job,{lean});const result=await runner.run(works);return res.status(['stopped','complete-with-errors'].includes(result.status)?503:200).json(result)}catch{console.error('isolated ledger cron storage/monitoring failed');return res.status(503).json({error:'isolated update stopped; monitoring storage unavailable'})}
}
module.exports={scheduler,handle,ROOT};
