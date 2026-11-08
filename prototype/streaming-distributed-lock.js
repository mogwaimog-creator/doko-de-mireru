'use strict';
// Offline interface demo only. Production needs atomic Redis SET NX PX
// and a server-side compare-token-and-delete (Lua/transaction).
// Never GET then DEL: another owner's lock could be deleted.
const PREFIX='doko:streaming-refresh-lock:v1:';
function lockKey(type,id){
 const n=Number(id);
 if(!['movie','tv'].includes(type)||!Number.isSafeInteger(n)||n<1)throw Error('invalid identity');
 return PREFIX+type+':'+n;
}
function createDistributedLock({acquireAtomic,releaseIfOwner,ttlMs=60000}={}){
 if(typeof acquireAtomic!=='function'||typeof releaseIfOwner!=='function')throw Error('atomic lock adapters required');
 if(!Number.isSafeInteger(ttlMs)||ttlMs<1000)throw Error('invalid ttl');
 async function run({type,id,token,refresh}){
  if(typeof token!=='string'||token.length<16)throw Error('unique token required');
  if(typeof refresh!=='function')throw Error('refresh required');
  const key=lockKey(type,id);
  const acquired=await acquireAtomic(key,token,ttlMs);
  if(!acquired)return {status:'busy'};
  try{return {status:'updated',value:await refresh()}}
  finally{await releaseIfOwner(key,token)}
 }
 return {run};
}
module.exports={createDistributedLock,lockKey};
