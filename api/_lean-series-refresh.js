'use strict';
// Issue #19: one series writer, batch intents + atomic records/progress commits.
// Local namespace only. No production credentials, reset, or upstream on import.
const {randomUUID,createHash}=require('node:crypto');
const {membershipSet,jstDay}=require('../prototype/streaming-ledger-schedule');
const {store}=require('../prototype/streaming-ledger');
const {fromTmdb}=require('../prototype/streaming-ledger-compat');
const CLAIM=`local control=redis.call('GET',KEYS[3]);if control and cjson.decode(control).status~='ready' then return {0,'paused'} end
if not redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]) then return {0,'busy'} end
local job=redis.call('GET',KEYS[2]);local values=redis.call('MGET',unpack(KEYS,4));local n=(#KEYS-3)/2
for i=n+1,#values do if values[i] then redis.call('DEL',KEYS[1]);return {0,'work-busy'} end end
if not job then redis.call('SET',KEYS[2],ARGV[3],'PXAT',ARGV[4]);job=ARGV[3] end;return {1,job,values}`;
// Only progress deltas cross the wire. Records remain exact Node JSON strings.
const MERGE_PROGRESS=`if next.wireVersion==1 then
 if next.keys~=nil or type(next.done)~='table' or type(next.sent)~='table' then return 0 end
 for k,v in pairs(next.done) do old.done[k]=v end;for k,v in pairs(next.sent) do old.sent[k]=v end
 next.keys=old.keys;next.done=old.done;next.sent=old.sent;next.wireVersion=nil
end
local packed=cjson.encode(next)
`;
function progressDelta(next,previous){
 const difference=(after,before)=>Object.fromEntries(Object.entries(after).filter(([k,v])=>before[k]!==v));
 const {keys,...rest}=next;return JSON.stringify({...rest,done:difference(next.done,previous.done),sent:difference(next.sent,previous.sent),wireVersion:1});
}
const INTENT=`local control=redis.call('GET',KEYS[3]);if control and cjson.decode(control).status~='ready' then return 0 end
if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;local current=redis.call('GET',KEYS[2]);if not current then return 0 end;local old=cjson.decode(current);local next=cjson.decode(ARGV[3]);if old.revision~=tonumber(ARGV[2]) or next.revision~=old.revision+1 or old.hash~=next.hash or old.day~=next.day then return 0 end
${MERGE_PROGRESS}redis.call('SET',KEYS[2],packed,'PXAT',ARGV[4]);redis.call('PEXPIRE',KEYS[1],ARGV[5]);return 1`;
const COMMIT=`local control=redis.call('GET',KEYS[3]);if control and cjson.decode(control).status~='ready' then return 0 end
if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;local raw=redis.call('GET',KEYS[2]);if not raw then return 0 end;local old=cjson.decode(raw);local next=cjson.decode(ARGV[3]);if old.revision~=tonumber(ARGV[2]) or next.revision~=old.revision+1 or old.hash~=next.hash or old.day~=next.day then return 0 end
${MERGE_PROGRESS}local values=redis.call('MGET',unpack(KEYS,4));local writes={KEYS[2],packed};for i=1,#values do local p=5+2*(i-1);if (ARGV[p]=='!missing' and values[i]) or (ARGV[p]~='!missing' and values[i]~=ARGV[p]) then return 0 end;writes[#writes+1]=KEYS[i+3];writes[#writes+1]=ARGV[p+1] end
redis.call('MSET',unpack(writes));redis.call('PEXPIREAT',KEYS[2],ARGV[4]);return 1`;
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
function leanSeriesRefresh(command,fetchProviders,{prefix='doko:dev:shared-stream:v1:',controlKey='doko:dev:content-control:v1',batchSize=32,concurrency=3,timeoutMs=6500,leaseMs=120000,budgetMs=200000,clock=Date.now,retentionDays=14,maxDispatches=2,maxRuns=48,onIntent=async()=>{},onCommit=async()=>{}}={}){
 if(process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')throw Error('isolated runner only');
 if(!/^doko:dev:[a-z0-9:-]+:$/.test(prefix)||!/^doko:dev:[a-z0-9:-]+$/.test(controlKey)||![batchSize,concurrency,maxDispatches,maxRuns].every(Number.isSafeInteger)||batchSize<1||batchSize>64||concurrency<1||concurrency>6||maxDispatches<1||maxDispatches>2||maxRuns<1||maxRuns>48||!Number.isSafeInteger(retentionDays)||!Number.isSafeInteger(leaseMs)||leaseMs>900000||!Number.isFinite(budgetMs)||budgetMs>240000||!Number.isFinite(timeoutMs)||timeoutMs<1||timeoutMs>6500||leaseMs<Math.ceil(batchSize/concurrency)*timeoutMs+1000||budgetMs<1||retentionDays<2||retentionDays>14)throw Error('invalid local batch refresh limits');
 const leaseKey=prefix+'series-batch-lease',dataKey=k=>prefix+'record:'+k,lockKey=k=>prefix+'lock:'+k,jobKey=day=>prefix+'batch-job:'+day;
 async function load(type,id){const ac=new AbortController();let timer;try{return await Promise.race([Promise.resolve().then(()=>fetchProviders(type,id,{signal:ac.signal})),new Promise((_,reject)=>timer=setTimeout(()=>{ac.abort();reject(Error('provider timeout'))},timeoutMs))])}finally{clearTimeout(timer)}}
 function draft(k,raw,payload,error,at,day){const [type,id]=k.split(':'),old=raw===null?null:JSON.parse(raw);if(old&&(old.type!==type||old.id!==Number(id)||old.schemaVersion!==1))throw Error('invalid saved stream identity');const ledger=store();ledger.register(type,id);if(old)ledger.load(JSON.stringify({version:1,records:[old]}));if(error)ledger.failure(type,id,String(error.message||error).slice(0,500),at);else{ledger.success(type,id,fromTmdb(payload),at);ledger.resolve(type,id)}const record=ledger.get(type,id);record.lastSeriesRunDay=day;record.errors=record.errors.filter(e=>e.status==='open').slice(-1).concat(record.errors.filter(e=>e.status==='resolved').slice(-5));return {...record,schemaVersion:1,revision:(old?.revision||0)+1}}
 function summary(job,reason){const values=Object.values(job.done);return {status:job.status,reason,day:job.day,total:job.keys.length,succeeded:values.filter(v=>v==='success').length,failed:values.filter(v=>v==='failed').length,pending:job.keys.length-values.length,dispatches:Object.values(job.sent).reduce((n,x)=>n+x,0),runs:job.runs,revision:job.revision}}
 async function run(at,works,{maxItems=1000,signal}={}){
  if(!Number.isFinite(Date.parse(at))||!Number.isSafeInteger(maxItems)||maxItems<0||maxItems>1000)throw Error('invalid batch request');const day=jstDay(at);if(day!==jstDay(new Date(clock()).toISOString()))throw Error('current JST day required');if(Date.parse(at)<Date.parse(day+'T06:00:00+09:00'))return {status:'not-due',day,reason:'before-six'};
  const keys=[...membershipSet(works)].sort();if(!keys.length||keys.length>1000)throw Error('bounded series roster required');const hash=createHash('sha256').update(JSON.stringify(keys)).digest('hex'),token=randomUUID(),initial={version:1,day,hash,keys,done:{},sent:{},revision:0,runs:0,status:'pending',expiresAt:Date.now()+retentionDays*86400000};
  const claim=await command(['EVAL',CLAIM,String(3+keys.length*2),leaseKey,jobKey(day),controlKey,...keys.map(dataKey),...keys.map(lockKey),token,String(leaseMs),JSON.stringify(initial),String(initial.expiresAt)]);if(Number(claim[0])!==1)return {status:claim[1]==='paused'?'stopped':'busy',reason:claim[1],day};
  let job=JSON.parse(claim[1]),durable=job;const snapshot=Object.fromEntries(keys.map((k,i)=>[k,claim[2][i]===false?null:claim[2][i]]));let attempted=0;
  try{
   if(job.version!==1||job.day!==day||job.hash!==hash||JSON.stringify(job.keys)!==JSON.stringify(keys)||!Number.isSafeInteger(job.revision)||!job.done||!job.sent||!Number.isSafeInteger(job.runs)||!Number.isSafeInteger(job.expiresAt)||job.expiresAt<=Date.now()||job.expiresAt>Date.now()+15*86400000||job.runs<0||job.revision<0)throw Error('saved job/roster requires review');
   if(Object.entries(job.done).some(([k,v])=>!keys.includes(k)||!['success','failed'].includes(v))||Object.entries(job.sent).some(([k,v])=>!keys.includes(k)||!Number.isSafeInteger(v)||v<1||v>maxDispatches))throw Error('invalid saved progress');
   if(job.status==='complete'||job.status==='complete-with-errors')return summary(job,'already-finished');if(job.runs>=maxRuns)return {...summary(job,'run-budget'),status:'stopped'};job={...job,done:{...job.done},sent:{...job.sent},runs:job.runs+1};
   for(const k of keys){const raw=snapshot[k];if(raw===null)continue;const r=JSON.parse(raw);if(r.type+':'+r.id!==k||r.schemaVersion!==1)throw Error('invalid saved record');if([r.lastSuccessAt,r.lastAttemptAt].some(v=>Number.isFinite(Date.parse(v))&&Date.parse(v)>Date.parse(at)))throw Error('clock behind stored value');if(r.lastSeriesRunDay===day)job.done[k]=r.errors?.some(e=>e.status==='open')?'failed':'success'}
   if(Object.keys(job.done).length===keys.length){const next={...job,revision:job.revision+1,status:Object.values(job.done).includes('failed')?'complete-with-errors':'complete'};if(!Number(await command(['EVAL',INTENT,'3',leaseKey,jobKey(day),controlKey,token,String(job.revision),progressDelta(next,durable),String(job.expiresAt),String(leaseMs)])))return {...summary(job,'intent-fenced'),status:'stopped'};return summary(next,'reconciled-records')}
   const deadline=clock()+budgetMs;let reason='finished';
   while(Object.keys(job.done).length<keys.length){
    if(signal?.aborted){reason='aborted';break}const remaining=deadline-clock()-1000;const safeItems=Math.floor(remaining/timeoutMs)*concurrency;
    if(safeItems<1){reason='time-budget';break}if(attempted>=maxItems){reason='item-budget';break}
    const pending=keys.filter(k=>!job.done[k]&&(job.sent[k]||0)<maxDispatches);if(!pending.length){reason='dispatch-budget';break}
    const batch=pending.slice(0,Math.min(batchSize,maxItems-attempted,safeItems)),intent={...job,sent:{...job.sent},status:'running',revision:job.revision+1};for(const k of batch)intent.sent[k]=(intent.sent[k]||0)+1;
    if(!Number(await command(['EVAL',INTENT,'3',leaseKey,jobKey(day),controlKey,token,String(job.revision),progressDelta(intent,durable),String(job.expiresAt),String(leaseMs)])))return {...summary(job,'intent-fenced'),status:'stopped'};job=intent;durable=job;await onIntent(job);attempted+=batch.length;
    const outcomes={};let cursor=0;async function worker(){while(cursor<batch.length){const k=batch[cursor++],[type,id]=k.split(':');try{outcomes[k]=draft(k,snapshot[k],await load(type,Number(id)),null,at,day)}catch(error){outcomes[k]=draft(k,snapshot[k],null,error,at,day)}}}await Promise.all(Array.from({length:Math.min(concurrency,batch.length)},worker));
    const next={...job,done:{...job.done},revision:job.revision+1};for(const k of batch)next.done[k]=outcomes[k].errors?.some(e=>e.status==='open')?'failed':'success';next.status=Object.keys(next.done).length===keys.length?(Object.values(next.done).includes('failed')?'complete-with-errors':'complete'):'paused';
    const pairs=batch.flatMap(k=>[snapshot[k]===null?'!missing':snapshot[k],JSON.stringify(outcomes[k])]);if(!Number(await command(['EVAL',COMMIT,String(batch.length+3),leaseKey,jobKey(day),controlKey,...batch.map(dataKey),token,String(job.revision),progressDelta(next,durable),String(job.expiresAt),...pairs])))return {...summary(job,'commit-fenced'),status:'stopped'};job=next;durable=job;for(const k of batch)snapshot[k]=JSON.stringify(outcomes[k]);await onCommit(job);
   }
   return {...summary(job,reason),status:job.status.startsWith('complete')?job.status:reason==='dispatch-budget'?'stopped':'paused'};
  }finally{try{await command(['EVAL',RELEASE,'1',leaseKey,token])}catch{/* no blind retry; lease expiry fences abandoned work */}}
 }
 return {run,keys:{leaseKey,dataKey,lockKey,jobKey}};
}
module.exports={leanSeriesRefresh,CLAIM,INTENT,COMMIT,RELEASE,progressDelta};
