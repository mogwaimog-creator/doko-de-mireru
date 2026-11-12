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
// Claim and re-read in one atomic operation; no worker can intervene between them.
const CLAIM_READ="local raw=redis.call('GET',KEYS[2]); local ok=redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]); return {ok and 1 or 0,raw or false}";
const COMMIT_RELEASE=COMMIT.replace("if revision~=tonumber(ARGV[2]) then return 0 end", "if revision~=tonumber(ARGV[2]) then redis.call('DEL',KEYS[1]); return 0 end").replace("return 1", "redis.call('DEL',KEYS[1]); return 1");
const FENCED_CLAIM="if redis.call('EXISTS',KEYS[3])==1 then return {0,false} end;"+CLAIM_READ;
const ACQUIRE="if redis.call('EXISTS',KEYS[2])==1 then return 0 end;return redis.call('SET',KEYS[1],ARGV[1],'NX','PX',ARGV[2]) and 1 or 0";
function sharedStore(command,{prefix='doko:dev:shared-stream:v1:',batchFenceKey=prefix+'series-batch-lease'}={}){
 if(typeof command!=='function'||!/^doko:dev:[a-z0-9:-]+:$/.test(prefix))throw Error('development namespace required');
 if(!/^doko:dev:[a-z0-9:-]+$/.test(batchFenceKey))throw Error('local batch fence required');
 const checked=k=>{const [type,id,...rest]=String(k).split(':');if(rest.length||key(type,id)!==k)throw Error('invalid work key');return k};
 const dataKey=k=>prefix+'record:'+checked(k),lockKey=k=>prefix+'lock:'+checked(k);
 return {
  keys:{dataKey,lockKey},
  async read(k){const raw=await command(['GET',dataKey(k)]);return raw===null?null:JSON.parse(raw)},
  async readMany(keys){if(!keys.length)return {};const raw=await command(['MGET',...keys.map(dataKey)]);if(!Array.isArray(raw)||raw.length!==keys.length)throw Error('invalid Redis batch');return Object.fromEntries(keys.map((k,i)=>[k,raw[i]===null?null:JSON.parse(raw[i])]))},
  async claimAndRead(k,token,ttlMs){
   if(!token||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid lease');
   const result=await command(['EVAL',FENCED_CLAIM,'3',lockKey(k),dataKey(k),batchFenceKey,token,String(ttlMs)]);
   if(!Array.isArray(result)||result.length!==2)throw Error('invalid claim response');
   return {acquired:Number(result[0])===1,record:result[1]===null||result[1]===false?null:JSON.parse(result[1])};
  },
  async saveAndRelease(k,token,record,revision=0){
   checked(k);if(key(record.type,record.id)!==k||!Number.isSafeInteger(revision)||revision<0)throw Error('invalid record');
   return Number(await command(['EVAL',COMMIT_RELEASE,'2',lockKey(k),dataKey(k),token,String(revision),JSON.stringify({...record,schemaVersion:1,revision:revision+1})]))===1;
  },
  async acquire(k,token,ttlMs){if(!token||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid lease');return Number(await command(['EVAL',ACQUIRE,'2',lockKey(k),batchFenceKey,token,String(ttlMs)]))===1},
  async release(k,token){return Number(await command(['EVAL',RELEASE,'1',lockKey(k),token]))===1},
  async saveIfOwner(k,token,record,revision=0){
   checked(k);if(key(record.type,record.id)!==k||!Number.isSafeInteger(revision)||revision<0)throw Error('invalid record');
   return Number(await command(['EVAL',COMMIT,'2',lockKey(k),dataKey(k),token,String(revision),JSON.stringify({...record,schemaVersion:1,revision:revision+1})]))===1;
  }
 };
}
module.exports={sharedStore,COMMIT,RELEASE,CLAIM_READ,COMMIT_RELEASE,FENCED_CLAIM,ACQUIRE};
