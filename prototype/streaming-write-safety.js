'use strict';
// Offline durable-write contract demonstration. Storage adapter must provide
// atomic compare-and-swap (CAS) and an owner-token fenced lock in production.
// Never mutate the prior record before the atomic commit succeeds.
function clone(x){return JSON.parse(JSON.stringify(x))}
async function commit({read,compareAndSwap,type,id,expectedVersion,next}){
 if(typeof read!=='function'||typeof compareAndSwap!=='function')throw Error('missing storage adapter');
 if(!Number.isSafeInteger(expectedVersion)||expectedVersion<0)throw Error('invalid version');
 const current=await read(type,id);
 if(!current||current.version!==expectedVersion)return {status:'conflict'};
 const candidate=clone(next);
 candidate.version=expectedVersion+1;
 const saved=await compareAndSwap(type,id,expectedVersion,candidate);
 if(!saved)return {status:'conflict'};
 return {status:'saved',record:candidate};
}
module.exports={commit};
