'use strict';
// Development-only Redis persistence adapter. No connection on import.
// Atomically checks the lease owner and writes one serialized streaming record.
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
const COMMIT="if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2]) return 1";
function redisStreamingStore(command,{prefix='doko:stream:prototype:v1:'}={}){
 if(typeof command!=='function'||!/^[-a-z0-9:]+$/i.test(prefix))throw Error('invalid Redis adapter');
 const lockKey=key=>prefix+'lock:'+key;
 const dataKey=key=>prefix+'data:'+key;
 return {
  async acquire(key,token,ttlMs){return (await command(['SET',lockKey(key),token,'NX','PX',String(ttlMs)]))==='OK'},
  async release(key,token){return Number(await command(['EVAL',RELEASE,'1',lockKey(key),token]))===1},
  async saveIfOwner(key,token,record){
   const payload=JSON.stringify(record);
   if(payload===undefined)throw Error('invalid streaming record');
   return Number(await command(['EVAL',COMMIT,'2',lockKey(key),dataKey(key),token,payload]))===1;
  },
  async read(key){const raw=await command(['GET',dataKey(key)]);return raw==null?null:JSON.parse(raw)},
  keys:{lockKey,dataKey}
 };
}
module.exports={redisStreamingStore,RELEASE,COMMIT};
