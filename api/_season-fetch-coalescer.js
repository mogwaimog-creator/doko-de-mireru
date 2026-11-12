'use strict';
// In-process, bounded, short-lived coalescing of simultaneous season fetches.
// This is NOT a distributed lock: separate Vercel instances may still fetch.
const MAX_ENTRIES=100;
const INFLIGHT=new Map();
function coalesceSeasonFetch(key,load){
 if(typeof load!=='function')throw Error('Missing season fetch');
 if(INFLIGHT.has(key))return INFLIGHT.get(key);
 // Do not evict in-flight requests; if saturated, run without coalescing.
 if(INFLIGHT.size>=MAX_ENTRIES)return Promise.resolve().then(load);
 const pending=Promise.resolve().then(load);
 INFLIGHT.set(key,pending);
 // Remove on success AND failure; do not cache results or errors.
 pending.then(()=>{if(INFLIGHT.get(key)===pending)INFLIGHT.delete(key);},
  ()=>{if(INFLIGHT.get(key)===pending)INFLIGHT.delete(key);});
 return pending;
}
module.exports={coalesceSeasonFetch};
