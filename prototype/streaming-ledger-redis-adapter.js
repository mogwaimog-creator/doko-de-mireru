'use strict';
// Redis REST adapter for offline contract testing. No commands run until called.
// IMPORTANT: commitIfOwner persists JSON in the same Lua operation as token check.
// This adapter does NOT execute arbitrary JS callbacks inside Redis.
function redisLeaseAdapter(command,{prefix='doko:streaming:v1:',writesEnabled=()=>true}={}){
 if(typeof command!=='function'||typeof writesEnabled!=='function')throw Error('invalid adapter');
 const lockKey=k=>prefix+'lock:'+k;
 const recordKey=k=>prefix+'record:'+k;
 const commitScript=`if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
if redis.call('PTTL',KEYS[1]) <= 0 then return 0 end
if ARGV[3] ~= '1' then return 0 end
redis.call('SET',KEYS[2],ARGV[2])
return 1`;
 const releaseScript=`if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end`;
 return {
  async acquire(k,token,ttlMs){if(!writesEnabled())return false;return await command(['SET',lockKey(k),token,'NX','PX',String(ttlMs)])==='OK'},
  async release(k,token){return Number(await command(['EVAL',releaseScript,'1',lockKey(k),token]))===1},
  async commitRecordIfOwner(k,token,record){if(!writesEnabled())return false;const payload=JSON.stringify(record);return Number(await command(['EVAL',commitScript,'2',lockKey(k),recordKey(k),token,payload,'1']))===1},
  async read(k){const raw=await command(['GET',recordKey(k)]);return raw?JSON.parse(raw):null},
  keys:{lockKey,recordKey}
 };
}
module.exports={redisLeaseAdapter};
