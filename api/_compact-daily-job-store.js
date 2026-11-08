'use strict';
// New v2 journals only: fixed 14-day retention, immutable roster, delta progress.
// Never reads/modifies/deletes prior v1 journals or old ledger keys.
const CLAIM=`local ok=redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]);if not ok then return {0,{}} end
if redis.call('EXISTS',KEYS[2])==0 then redis.call('HSET',KEYS[2],'base',ARGV[3],'meta',ARGV[4]);redis.call('EXPIRE',KEYS[2],ARGV[5]) end
return {1,redis.call('HGETALL',KEYS[2])}`;
const CHECKPOINT=`if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('PTTL',KEYS[1])<=0 or redis.call('PTTL',KEYS[2])<=0 then return 0 end
local old=cjson.decode(redis.call('HGET',KEYS[2],'meta'));local next=cjson.decode(ARGV[3]);
if old.revision~=tonumber(ARGV[2]) or next.revision~=old.revision+1 or old.day~=next.day or old.manifestHash~=next.manifestHash then return 0 end
for i=5,#ARGV,2 do local field=ARGV[i];local value=ARGV[i+1];local prior=redis.call('HGET',KEYS[2],field)
 if string.sub(field,1,2)=='c:' then if (value~='success' and value~='failed') or (prior and prior~=value) then return 0 end
 elseif string.sub(field,1,2)=='d:' then local n=tonumber(value);if not n or n<1 or n>5 or (prior and tonumber(prior)>n) then return 0 end
 else return 0 end end
local args={'meta',ARGV[3]};for i=5,#ARGV do args[#args+1]=ARGV[i] end;redis.call('HSET',KEYS[2],unpack(args));if ARGV[4]=='1' then redis.call('DEL',KEYS[1]) end;return 1`;
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
function split(job){const {keys,completed,dispatches,...meta}=job;return {base:JSON.stringify({keys}),meta:JSON.stringify(meta)}}
function decode(value){const fields=Array.isArray(value)?Object.fromEntries(Array.from({length:value.length/2},(_,i)=>[value[2*i],value[2*i+1]])):value;if(!fields||!Object.keys(fields).length)return null;const job={...JSON.parse(fields.meta),...JSON.parse(fields.base),completed:{},dispatches:{}};for(const [k,v] of Object.entries(fields)){if(k.startsWith('c:'))job.completed[k.slice(2)]=v;if(k.startsWith('d:'))job.dispatches[k.slice(2)]=Number(v)}return job}
function compactDailyJobStore(command,{prefix='doko:dev:stream-jobs:v2:',retentionSeconds=14*86400}={}){
 if(typeof command!=='function'||!/^doko:dev:[a-z0-9:-]+:$/.test(prefix)||!Number.isSafeInteger(retentionSeconds)||retentionSeconds<2*86400||retentionSeconds>31*86400)throw Error('invalid local journal retention');
 const dayKey=day=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('invalid day');return prefix+day},lockKey=day=>dayKey(day)+':lease',snapshots=new Map();
 return {
  async claim(day,token,ttlMs,initial){if(!token||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid job lease');const {base,meta}=split(initial);const result=await command(['EVAL',CLAIM,'2',lockKey(day),dayKey(day),token,String(ttlMs),base,meta,String(retentionSeconds)]);const job=Number(result[0])===1?decode(result[1]):null;if(job)snapshots.set(token,structuredClone(job));return {acquired:Number(result[0])===1,job}},
  async checkpoint(day,token,revision,next,{release=false}={}){
   const old=snapshots.get(token);if(!old||old.revision!==revision||JSON.stringify(old.keys)!==JSON.stringify(next.keys))return false;
   const delta=[];for(const [map,prefix] of [['completed','c:'],['dispatches','d:']]){
    if(Object.keys(old[map]).some(k=>!Object.hasOwn(next[map],k)))throw Error('progress cannot be removed');
    for(const [k,v] of Object.entries(next[map])){if(!old.keys.includes(k))throw Error('unknown progress key');if(old[map][k]!==v)delta.push(prefix+k,String(v))}
   }
   const {meta}=split(next);if(Buffer.byteLength(meta)+delta.reduce((n,x)=>n+Buffer.byteLength(x),0)>32768)throw Error('journal delta too large');
   const saved=Number(await command(['EVAL',CHECKPOINT,'2',lockKey(day),dayKey(day),token,String(revision),meta,release?'1':'0',...delta]))===1;
   if(saved){if(release)snapshots.delete(token);else snapshots.set(token,structuredClone(next))}return saved;
  },
  async release(day,token){snapshots.delete(token);return Number(await command(['EVAL',RELEASE,'1',lockKey(day),token]))===1},
  async read(day){return decode(await command(['HGETALL',dayKey(day)]))},keys:{dayKey,lockKey},retentionSeconds
 };
}
module.exports={compactDailyJobStore,CLAIM,CHECKPOINT};
