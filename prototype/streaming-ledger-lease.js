'use strict';
// Storage-neutral lease protocol. Production adapter must implement atomic acquire
// (e.g. Redis SET NX PX) and token-checked release. Never use GET + DEL.
const crypto=require('node:crypto');
function lease(adapter,{ttlMs=30000}={}){
 if(!adapter||typeof adapter.acquire!=='function'||typeof adapter.release!=='function'||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid lease adapter');
 async function run(key,task){
  const token=crypto.randomUUID();
  const acquired=await adapter.acquire(key,token,ttlMs);
  if(!acquired)return {acquired:false};
  try{return {acquired:true,value:await task()}}
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
  inspect(key){return entries.get(key)||null}
 };
}
module.exports={lease,memoryAdapter};
