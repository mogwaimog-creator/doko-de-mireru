'use strict';
// Durable progress for local-only daily jobs. Own keys only; never deletes job data.
const CLAIM=`local ok=redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]); if not ok then return {0,redis.call('GET',KEYS[2]) or false} end
local raw=redis.call('GET',KEYS[2]); if not raw then redis.call('SET',KEYS[2],ARGV[3]);raw=ARGV[3] end; return {1,raw}`;
const CHECKPOINT=`if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('PTTL',KEYS[1])<=0 then return 0 end
local current=cjson.decode(redis.call('GET',KEYS[2]));local next=cjson.decode(ARGV[3]);
if current.revision~=tonumber(ARGV[2]) or current.manifestHash~=next.manifestHash or current.day~=next.day then return 0 end
redis.call('SET',KEYS[2],ARGV[3]);if ARGV[4]=='1' then redis.call('DEL',KEYS[1]) end;return 1`;
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
function dailyJobStore(command,{prefix='doko:dev:stream-jobs:v1:'}={}){
 if(typeof command!=='function'||!/^doko:dev:[a-z0-9:-]+:$/.test(prefix))throw Error('development job namespace required');
 const dayKey=day=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('invalid day');return prefix+day};
 const lockKey=day=>dayKey(day)+':lease';
 return {
  async claim(day,token,ttlMs,initial){if(!token||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid job lease');const r=await command(['EVAL',CLAIM,'2',lockKey(day),dayKey(day),token,String(ttlMs),JSON.stringify(initial)]);if(!Array.isArray(r)||r.length!==2)throw Error('invalid job claim');return {acquired:Number(r[0])===1,job:r[1]?JSON.parse(r[1]):null}},
  async checkpoint(day,token,revision,next,{release=false}={}){const json=JSON.stringify(next);if(Buffer.byteLength(json)>256*1024)throw Error('job journal too large');return Number(await command(['EVAL',CHECKPOINT,'2',lockKey(day),dayKey(day),token,String(revision),json,release?'1':'0']))===1},
  async release(day,token){return Number(await command(['EVAL',RELEASE,'1',lockKey(day),token]))===1},
  async read(day){const raw=await command(['GET',dayKey(day)]);return raw===null?null:JSON.parse(raw)},
  keys:{dayKey,lockKey}
 };
}
module.exports={dailyJobStore,CLAIM,CHECKPOINT,RELEASE};
