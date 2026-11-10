'use strict';
// Instrumented application bounds, NOT Upstash billing or account-wide memory.
// No polling, scans, INFO or remote requests on import. Pauses never expire automatically.
const {AsyncLocalStorage}=require('node:async_hooks'),{createHash}=require('node:crypto');
const pausedCache=new Map();
const KEY='doko:dev:acquisition-guard:v1',CONTROL='doko:dev:content-control:v1',ACTIVE='doko:dev:cutover:v1:active';
const ENTER=`local c=redis.call('GET',KEYS[1]);if not c or cjson.decode(c).status~='ready' then return {0,1} end;if redis.call('HLEN',KEYS[2])>=64 then return {-1,1} end;redis.call('HSET',KEYS[2],ARGV[1],ARGV[2]);local raw=redis.call('GET',KEYS[3]);local ok,g=pcall(cjson.decode,raw or '');if not ok or g.version~=1 then return {1,1} end;if g.paused then return {1,1} end
local minute=math.floor(tonumber(ARGV[3])/60000);if g.minute~=minute then g.minute=minute;g.requests=0;g.acquisitions=0;g.scheduled=0;g.failures=0 end;g.requests=g.requests+1
if g.requests>g.limits.requestsPerMinute then g.paused=true;g.reason='request-rate' end
for _,v in pairs(g.inflight) do if tonumber(ARGV[3])-v.at>360000 then g.paused=true;g.reason='abandoned-reservation' end end
redis.call('SET',KEYS[3],cjson.encode(g));return {1,g.paused and 1 or 0}`;
const ADMIT=`local raw=redis.call('GET',KEYS[1]);local ok,g=pcall(cjson.decode,raw or '');if not ok or g.version~=1 then return {0,'guard-unavailable'} end;if g.paused then return {0,g.reason or 'paused'} end
local c=redis.call('GET',KEYS[2]);if not c then return {0,'control-unavailable'} end;local control=cjson.decode(c);if control.status~='ready' or control.newWorkAcquisitionPaused then return {0,'operator-pause'} end
local prior=redis.call('GET',KEYS[3]);if prior then local f=cjson.decode(prior);if f.identity==ARGV[2] and f.untilAt>tonumber(ARGV[3]) then return {0,'failure-cooldown'} end end
local minute=math.floor(tonumber(ARGV[3])/60000);if g.minute~=minute then g.minute=minute;g.requests=0;g.acquisitions=0;g.scheduled=0;g.failures=0 end
if g.day~=ARGV[4] then g.day=ARGV[4];g.daily=0;g.dailyScheduled=0 end
local scheduled=ARGV[5]=='1';local rate=scheduled and 'scheduled' or 'acquisitions';local daily=scheduled and 'dailyScheduled' or 'daily';local rateLimit=scheduled and g.limits.scheduledPerMinute or g.limits.acquisitionsPerMinute;local dayLimit=scheduled and g.limits.scheduledPerDay or math.min(g.limits.acquisitionsPerDay,tonumber(ARGV[6]))
if g[rate]>=rateLimit or g[daily]>=dayLimit then g.paused=true;g.reason='acquisition-rate-or-count';redis.call('SET',KEYS[1],cjson.encode(g));return {0,g.reason} end
if not g.inflight[ARGV[1]] then
 local commands=0;local bytes=0;for _,v in pairs(g.inflight) do commands=commands+v.commands;bytes=bytes+v.bytes end
 if g.commandUnits+commands+g.limits.commandReservation>g.limits.commandUnits or g.writeUpperBytes+bytes+g.limits.byteReservation>g.limits.writeUpperBytes then
  if commands==0 then g.paused=true;g.reason='conservative-budget-headroom';redis.call('SET',KEYS[1],cjson.encode(g)) end;return {0,'budget-headroom-or-inflight'} end
 g.inflight[ARGV[1]]={commands=g.limits.commandReservation,bytes=g.limits.byteReservation,at=tonumber(ARGV[3])}
end
g[rate]=g[rate]+1;g[daily]=g[daily]+1;redis.call('SET',KEYS[1],cjson.encode(g));return {1,tostring(g.limits.byteReservation)}`;
const FAILURE=`local raw=redis.call('GET',KEYS[1]);local ok,g=pcall(cjson.decode,raw or '');if not ok or g.version~=1 then return 0 end;local minute=math.floor(tonumber(ARGV[2])/60000);if g.minute~=minute then g.minute=minute;g.requests=0;g.acquisitions=0;g.scheduled=0;g.failures=0 end;g.failures=g.failures+1;if g.failures>=g.limits.failuresPerMinute then g.paused=true;g.reason='upstream-failures' end;redis.call('SET',KEYS[2],ARGV[3],'PX',300000);redis.call('SET',KEYS[1],cjson.encode(g));return g.paused and 1 or 0`;
const FINISH=`redis.call('HDEL',KEYS[2],ARGV[1]);local raw=redis.call('GET',KEYS[1]);local ok,g=pcall(cjson.decode,raw or '');if not ok or g.version~=1 then return 0 end;g.inflight[ARGV[1]]=nil;g.commandUnits=g.commandUnits+tonumber(ARGV[2]);g.writeUpperBytes=g.writeUpperBytes+tonumber(ARGV[3]);if g.commandUnits>=g.limits.commandUnits or g.writeUpperBytes>=g.limits.writeUpperBytes then g.paused=true;g.reason='instrumented-budget' end;redis.call('SET',KEYS[1],cjson.encode(g));return 1`;
const TRIP=`local raw=redis.call('GET',KEYS[1]);local ok,g=pcall(cjson.decode,raw or '');if not ok or g.version~=1 then return 0 end;if g.paused then return 0 end;g.paused=true;g.reason=ARGV[1];redis.call('SET',KEYS[1],cjson.encode(g));return 1`;
function initial({commandUnits=0,writeUpperBytes=0,limits={}}={}){
 const l={commandUnits:40000,writeUpperBytes:8388608,requestsPerMinute:120,acquisitionsPerMinute:30,scheduledPerMinute:300,acquisitionsPerDay:300,scheduledPerDay:266,failuresPerMinute:5,commandReservation:10000,byteReservation:2097152,...limits};
 if(![commandUnits,writeUpperBytes,...Object.values(l)].every(n=>Number.isSafeInteger(n)&&n>=0)||Object.values(l).some(n=>n<1)||l.commandUnits>40000||l.writeUpperBytes>8388608||l.commandReservation>10000||l.byteReservation>2097152||commandUnits>=l.commandUnits||writeUpperBytes>=l.writeUpperBytes)throw Error('bounded guard baseline required');
 return {version:1,paused:false,reason:null,commandUnits,writeUpperBytes,limits:l,minute:0,requests:0,acquisitions:0,scheduled:0,failures:0,day:'',daily:0,dailyScheduled:0,inflight:{},measurement:'conservative instrumented command units and cumulative write upper bounds; not billed commands or actual DB capacity; telemetry stops for cached paused reads'};
}
function stopped(reason){return Object.assign(Error('Acquisition stopped: '+reason),{code:'ACQUISITION_STOPPED'})}
function session(command,{clock=Date.now}={}){
 const context=new AsyncLocalStorage();let installed=false;
 const connection=require('./_release-connection'),cacheKey=connection.guardCacheKey(command);
 const remember=()=>{if(cacheKey){if(pausedCache.size>=16)pausedCache.delete(pausedCache.keys().next().value);pausedCache.set(cacheKey,clock()+60000)}};
 const hooks={onCommand({cost,growth}){const c=context.getStore();if(c){c.units+=cost;c.bytes+=growth}},async beforeDataWrite(growth){const c=context.getStore();if(!c||!c.allowed||c.paused||c.bytes+growth>c.allowance){if(c&&!c.paused)await trip('write-reservation');throw stopped('write-reservation')}}};
 installed=connection.observe(command,hooks);
 async function trip(reason){const c=context.getStore();if(c)c.paused=true;remember();try{await command(['EVAL',TRIP,'1',KEY,reason])}catch{/* No recursive telemetry retry. */}}
 async function admit(path,params,{scheduled=false,dailyLimit=300}={}){
  const c=context.getStore();if(!installed||!c||c.paused)throw stopped('paused-or-unmetered');
  const identity=createHash('sha256').update(path+JSON.stringify(Object.fromEntries(Object.entries(params||{}).filter(([k])=>k!=='api_key').sort(([a],[b])=>a.localeCompare(b))))).digest('hex'),bucket=KEY+':failure:'+String(parseInt(identity.slice(0,8),16)%64),now=clock(),day=new Date(now+9*3600000).toISOString().slice(0,10);
  let result;try{result=await command(['EVAL',ADMIT,'3',KEY,CONTROL,bucket,c.token,identity,String(now),day,scheduled?'1':'0',String(dailyLimit)])}catch{c.paused=true;remember();throw stopped('guard-unavailable')}
  if(Number(result[0])!==1){if(!['failure-cooldown','budget-headroom-or-inflight'].includes(result[1])){c.paused=true;remember()}throw stopped(String(result[1]))}
  c.allowed=true;c.allowance=Number(result[1]);return {identity,bucket};
 }
 async function failed(ticket){const c=context.getStore();if(!ticket||!c||c.paused)return;try{const now=clock(),result=await command(['EVAL',FAILURE,'2',KEY,ticket.bucket,ticket.identity,String(now),JSON.stringify({identity:ticket.identity,untilAt:now+300000})]);if(Number(result)===1){c.paused=true;remember()}}catch{c.paused=true;remember()}}
 return {withContext:fn=>context.run({token:null,units:0,bytes:0,paused:!installed,allowed:false,allowance:0},fn),async enter(token,ticket){const c=context.getStore();c.token=token;if(cacheKey&&(pausedCache.get(cacheKey)||0)>clock()){c.paused=true;return Number(await command(['EVAL',require('./_cutover-runtime-dev').ENTER,'2',CONTROL,ACTIVE,token,ticket,'1']))}const r=await command(['EVAL',ENTER,'3',CONTROL,ACTIVE,KEY,token,ticket,String(clock())]);c.paused=Number(r[1])===1;if(c.paused)remember();return Number(r[0])},async finish(token){const c=context.getStore();try{if(c.paused&&!c.allowed){await command(['HDEL',ACTIVE,token]);return}await command(['EVAL',FINISH,'2',KEY,ACTIVE,token,String(c.units+8),String(c.bytes)])}catch{c.paused=true}},admit,failed,trip,isPaused:()=>context.getStore()?.paused!==false,status:async()=>{const raw=await command(['GET',KEY]);return raw?JSON.parse(raw):{paused:true,reason:'guard-unavailable'}}};
}
module.exports={KEY,ENTER,ADMIT,FAILURE,FINISH,TRIP,initial,session,stopped};
