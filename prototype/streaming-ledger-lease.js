'use strict';
// Storage-neutral lease protocol. commitIfOwner must atomically validate ownership and persist data in the SAME backing store in production. Production adapter must implement atomic acquire
// (e.g. Redis SET NX PX) and token-checked release. Never use GET + DEL.
const crypto=require('node:crypto');
function lease(adapter,{ttlMs=30000}={}){
 if(!adapter||typeof adapter.acquire!=='function'||typeof adapter.release!=='function'||typeof adapter.commitIfOwner!=='function'||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid lease adapter');
 async function run(key,task){
  const token=crypto.randomUUID();
  const acquired=await adapter.acquire(key,token,ttlMs);
  if(!acquired)return {acquired:false};
  try{return {acquired:true,value:await task({commit:(write)=>adapter.commitIfOwner(key,token,write)})}}
  finally{await adapter.release(key,token)}
 }
 return {run};
}
// Offline shared-memory adapter used only by tests, not suitable for deployment.
function memoryAdapter(){
 const entries=new Map();
 return {
  async acquire(key,token,ttl){const now=Date.now(),entry=entries.get(key);if(entry&&entry.until>now)return false;entries.set(key,{token,until:now+ttl});return true},
  async release(key,token){if(entries.get(key)?.token!==token)return false;entries.delete(key);return true},
  async commitIfOwner(key,token,write){const entry=entries.get(key);if(!entry||entry.token!==token||entry.until<=Date.now())return false;await write();return true},
  inspect(key){return entries.get(key)||null}
 };
}
module.exports={lease,memoryAdapter};
