'use strict';
// Isolated development store. CAS and owner validation execute in one Redis Lua call.
const {key}=require('../prototype/streaming-ledger');
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
const COMMIT=`if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('PTTL',KEYS[1])<=0 then return 0 end
local raw=redis.call('GET',KEYS[2])
local revision=0
if raw then revision=cjson.decode(raw).revision or 0 end
if revision~=tonumber(ARGV[2]) then return 0 end
redis.call('SET',KEYS[2],ARGV[3])
return 1`;
function sharedStore(command,{prefix='doko:dev:shared-stream:v1:'}={}){
 if(typeof command!=='function'||!/^doko:dev:[a-z0-9:-]+:$/.test(prefix))throw Error('development namespace required');
 const checked=k=>{const [type,id,...rest]=String(k).split(':');if(rest.length||key(type,id)!==k)throw Error('invalid work key');return k};
 const dataKey=k=>prefix+'record:'+checked(k),lockKey=k=>prefix+'lock:'+checked(k);
 return {
  keys:{dataKey,lockKey},
  async read(k){const raw=await command(['GET',dataKey(k)]);return raw===null?null:JSON.parse(raw)},
  async acquire(k,token,ttlMs){if(!token||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid lease');return await command(['SET',lockKey(k),token,'NX','PX',String(ttlMs)])==='OK'},
  async release(k,token){return Number(await command(['EVAL',RELEASE,'1',lockKey(k),token]))===1},
  async saveIfOwner(k,token,record,revision=0){
   checked(k);if(key(record.type,record.id)!==k||!Number.isSafeInteger(revision)||revision<0)throw Error('invalid record');
   return Number(await command(['EVAL',COMMIT,'2',lockKey(k),dataKey(k),token,String(revision),JSON.stringify({...record,schemaVersion:1,revision:revision+1})]))===1;
  }
 };
}
module.exports={sharedStore,COMMIT,RELEASE};
