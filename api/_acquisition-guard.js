'use strict';
// Recovery guard v2: bounded upstream calls without Redis command/byte reservations.
// Old v1 paused/inflight data is intentionally not consulted or modified.
const {AsyncLocalStorage}=require('node:async_hooks');
const {createHash}=require('node:crypto');
const KEY='doko:dev:acquisition-guard:v2';
const CONTROL='doko:dev:content-control:v1';
const ACTIVE='doko:dev:cutover:v1:active';
const ENTER=`local raw=redis.call('GET',KEYS[1]);if not raw then return 0 end;local ok,c=pcall(cjson.decode,raw);if not ok or c.status~='ready' then return 0 end;local now=tonumber(ARGV[3]);if not now then return 0 end;local entries=redis.call('HGETALL',KEYS[2]);for i=1,#entries,2 do local valid,t=pcall(cjson.decode,entries[i+1]);if not valid or type(t)~='table' or type(t.startedAt)~='number' or t.startedAt<now-900000 or t.startedAt>now+60000 then redis.call('HDEL',KEYS[2],entries[i]) end end;if redis.call('HLEN',KEYS[2])>=64 then return -1 end;redis.call('HSET',KEYS[2],ARGV[1],ARGV[2]);return 1`;
const ADMIT=`local raw=redis.call('GET',KEYS[2]);if not raw then return {0,'control-unavailable'} end;local ok,c=pcall(cjson.decode,raw);if not ok or c.status~='ready' or c.newWorkAcquisitionPaused then return {0,'operator-pause'} end
local failure=redis.call('GET',KEYS[3]);if failure then local good,f=pcall(cjson.decode,failure);if good and f.identity==ARGV[1] and f.untilAt>tonumber(ARGV[2]) then return {0,'failure-cooldown'} end end
local rawState=redis.call('GET',KEYS[1]);local valid,s=pcall(cjson.decode,rawState or '');if not valid or s.version~=2 then s={version=2,minute=0,requests=0,acquisitions=0,scheduled=0,failures=0,day='',daily=0,dailyScheduled=0} end
local minute=math.floor(tonumber(ARGV[2])/60000);if s.minute~=minute then s.minute=minute;s.requests=0;s.acquisitions=0;s.scheduled=0;s.failures=0 end
if s.day~=ARGV[3] then s.day=ARGV[3];s.daily=0;s.dailyScheduled=0 end
local scheduled=ARGV[4]=='1';local rate=scheduled and 'scheduled' or 'acquisitions';local daily=scheduled and 'dailyScheduled' or 'daily';local perMinute=scheduled and 300 or 30;local perDay=scheduled and 266 or math.min(300,tonumber(ARGV[5]))
if s[rate]>=perMinute or s[daily]>=perDay then return {0,'upstream-limit'} end
s[rate]=s[rate]+1;s[daily]=s[daily]+1;redis.call('SET',KEYS[1],cjson.encode(s));return {1,'admitted'}`;
const FAILURE=`local raw=redis.call('GET',KEYS[1]);local ok,s=pcall(cjson.decode,raw or '');if not ok or s.version~=2 then return 0 end;local minute=math.floor(tonumber(ARGV[2])/60000);if s.minute~=minute then s.minute=minute;s.requests=0;s.acquisitions=0;s.scheduled=0;s.failures=0 end;s.failures=s.failures+1;redis.call('SET',KEYS[2],ARGV[3],'PX',300000);redis.call('SET',KEYS[1],cjson.encode(s));return s.failures>=5 and 1 or 0`;
function stopped(reason){return Object.assign(Error('Acquisition stopped: '+reason),{code:'ACQUISITION_STOPPED'})}
function session(command,{clock=Date.now}={}){
 const context=new AsyncLocalStorage();
 const current=()=>context.getStore();
 return {
  withContext:fn=>context.run({token:null,paused:false,allowed:false},fn),
  async enter(token,ticket){const c=current();if(!c)throw stopped('missing-context');c.token=token;const result=Number(await command(['EVAL',ENTER,'2',CONTROL,ACTIVE,token,ticket,String(clock())]));c.paused=result!==1;return result},
  async finish(token){await command(['HDEL',ACTIVE,token])},
  async admit(path,params,{scheduled=false,dailyLimit=300}={}){
   const c=current();if(!c||c.paused)throw stopped('inactive');
   const identity=createHash('sha256').update(path+JSON.stringify(Object.fromEntries(Object.entries(params||{}).filter(([k])=>k!=='api_key').sort(([a],[b])=>a.localeCompare(b))))).digest('hex');
   const bucket=KEY+':failure:'+String(parseInt(identity.slice(0,8),16)%64),now=clock(),day=new Date(now+9*3600000).toISOString().slice(0,10);
   const result=await command(['EVAL',ADMIT,'3',KEY,CONTROL,bucket,identity,String(now),day,scheduled?'1':'0',String(dailyLimit)]);
   if(Number(result[0])!==1)throw stopped(String(result[1]));
   c.allowed=true;return {identity,bucket};
  },
  async failed(ticket){if(!ticket)return;const now=clock();await command(['EVAL',FAILURE,'2',KEY,ticket.bucket,ticket.identity,String(now),JSON.stringify({identity:ticket.identity,untilAt:now+300000})])},
  async trip(reason){const c=current();if(c)c.paused=true;throw stopped(reason)},
  isPaused:()=>current()?.paused!==false,
  status:async()=>{const raw=await command(['GET',KEY]);return raw?JSON.parse(raw):{version:2,paused:false,day:'',daily:0,dailyScheduled:0}}
 };
}
module.exports={KEY,ENTER,ADMIT,FAILURE,session,stopped};
