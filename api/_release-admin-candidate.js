'use strict';
// Existing timing-safe authentication runs before any readiness/backend operation.
// Inactive by default. Even authenticated resume requires complete release evidence.
function createHandler({ops,token,active=()=>false,activationGate=async()=>({ready:false})}={}){
 if(typeof token!=='function')throw Error('explicit administrator token provider required');
 const guarded=ops?{...ops,resume:async(...args)=>{if(!(await activationGate()).ready)throw Error('release readiness has not been verified');return ops.resume(...args)}}:undefined;
 return require('./ledger-control').createHandler({ops:guarded,active:()=>active()===true&&typeof token()==='string'&&token().length>=32,token});
}
module.exports={createHandler};
