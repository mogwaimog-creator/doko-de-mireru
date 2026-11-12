'use strict';
// New v2 journals only: fixed 14-day retention, immutable roster, delta progress.
// Never reads/modifies/deletes prior v1 journals or old ledger keys.
const CLAIM=`local ok=redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]);if not ok then return {0,{}} end
if redis.call('EXISTS',KEYS[2])==0 then if #KEYS==3 and redis.call('EXISTS',KEYS[3])==1 then return {2,{}} end;redis.call('HSET',KEYS[2],'base',ARGV[3],'meta',ARGV[4],'progress',string.rep('A',#cjson.decode(ARGV[3]).keys));redis.call('EXPIRE',KEYS[2],ARGV[5]) end
return {1,redis.call('HGETALL',KEYS[2])}`;
const CHECKPOINT=`if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('PTTL',KEYS[1])<=0 or redis.call('PTTL',KEYS[2])<=0 then return 0 end
local old=cjson.decode(redis.call('HGET',KEYS[2],'meta'));local next=cjson.decode(ARGV[3]);
if old.revision~=tonumber(ARGV[2]) or next.revision~=old.revision+1 or old.day~=next.day or old.manifestHash~=next.manifestHash then return 0 end
local progress=redis.call('HGET',KEYS[2],'progress');if not progress then return 0 end
for i=5,#ARGV,2 do local index=tonumber(ARGV[i]);local code=ARGV[i+1];if not index or index<0 or index>=#progress or index~=math.floor(index) or #code~=1 then return 0 end
 local n=string.byte(code)-65;local oldcode=string.byte(progress,index+1)-65;if n<0 or n>17 or math.floor(n/3)<math.floor(oldcode/3) or (oldcode%3~=0 and n%3~=oldcode%3) then return 0 end
 progress=string.sub(progress,1,index)..code..string.sub(progress,index+2)
end
redis.call('HSET',KEYS[2],'meta',ARGV[3],'progress',progress);if ARGV[4]=='1' then redis.call('DEL',KEYS[1]) end;return 1`;
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
function split(job){const {keys,completed,dispatches,...meta}=job;return {base:JSON.stringify({keys}),meta:JSON.stringify(meta)}}
function decode(value){
 const fields=Array.isArray(value)?Object.fromEntries(Array.from({length:value.length/2},(_,i)=>[value[2*i],value[2*i+1]])):value;if(!fields||!Object.keys(fields).length)return null;
 const job={...JSON.parse(fields.meta),...JSON.parse(fields.base),completed:{},dispatches:{}};if(typeof fields.progress!=='string'||fields.progress.length!==job.keys.length)throw Error('invalid packed progress');
 for(let i=0;i<job.keys.length;i++){const n=fields.progress.charCodeAt(i)-65;if(n<0||n>17)throw Error('invalid packed state');if(Math.floor(n/3))job.dispatches[job.keys[i]]=Math.floor(n/3);if(n%3)job.completed[job.keys[i]]=n%3===1?'success':'failed'}return job;
}
function compactDailyJobStore(command,{prefix='doko:dev:stream-jobs:v2:',retentionSeconds=14*86400,clock=Date.now,enforceCurrentDay=true,legacyPrefix=prefix==='doko:dev:stream-jobs:v2:'?'doko:dev:stream-jobs:v1:':null}={}){
 if(typeof command!=='function'||!/^doko:dev:[a-z0-9:-]+:$/.test(prefix)||!Number.isSafeInteger(retentionSeconds)||retentionSeconds<2*86400||retentionSeconds>31*86400)throw Error('invalid local journal retention');
 if(legacyPrefix!==null&&!/^doko:dev:[a-z0-9:-]+:$/.test(legacyPrefix))throw Error('invalid legacy namespace');
 const dayKey=day=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('invalid day');return prefix+day},lockKey=day=>dayKey(day)+':lease',snapshots=new Map();
 return {
  async claim(day,token,ttlMs,initial){if(enforceCurrentDay&&day!==require('../prototype/streaming-ledger-schedule').jstDay(new Date(clock()).toISOString()))throw Error('current JST day required; expired history cannot restart');if(!token||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid job lease');const {base,meta}=split(initial);const result=await command(['EVAL',CLAIM,legacyPrefix?'3':'2',lockKey(day),dayKey(day),...(legacyPrefix?[legacyPrefix+day]:[]),token,String(ttlMs),base,meta,String(retentionSeconds)]);if(Number(result[0])===2){await command(['EVAL',RELEASE,'1',lockKey(day),token]);throw Error('existing v1 journal requires reviewed migration; preserved')}const job=Number(result[0])===1?decode(result[1]):null;if(job)snapshots.set(token,structuredClone(job));return {acquired:Number(result[0])===1,job}},
  async checkpoint(day,token,revision,next,{release=false}={}){
   const old=snapshots.get(token);if(!old||old.revision!==revision||JSON.stringify(old.keys)!==JSON.stringify(next.keys))return false;
   const delta=[];
   for(const map of ['completed','dispatches'])if(Object.keys(old[map]).some(k=>!Object.hasOwn(next[map],k))||Object.keys(next[map]).some(k=>!old.keys.includes(k)))throw Error('progress cannot be removed or invented');
   const encode=(job,k)=>{const d=job.dispatches[k]||0,s=job.completed[k];if(!Number.isSafeInteger(d)||d<0||d>5||(s!==undefined&&!['success','failed'].includes(s)))throw Error('invalid progress');return String.fromCharCode(65+d*3+(s==='success'?1:s==='failed'?2:0))};
   old.keys.forEach((k,i)=>{const code=encode(next,k);if(code!==encode(old,k))delta.push(String(i),code)});
   const {meta}=split(next);if(Buffer.byteLength(meta)+delta.reduce((n,x)=>n+Buffer.byteLength(x),0)>32768)throw Error('journal delta too large');
   const saved=Number(await command(['EVAL',CHECKPOINT,'2',lockKey(day),dayKey(day),token,String(revision),meta,release?'1':'0',...delta]))===1;
   if(saved){if(release)snapshots.delete(token);else snapshots.set(token,structuredClone(next))}return saved;
  },
  async release(day,token){snapshots.delete(token);return Number(await command(['EVAL',RELEASE,'1',lockKey(day),token]))===1},
  async read(day){return decode(await command(['HGETALL',dayKey(day)]))},keys:{dayKey,lockKey},retentionSeconds
 };
}
module.exports={compactDailyJobStore,CLAIM,CHECKPOINT};
