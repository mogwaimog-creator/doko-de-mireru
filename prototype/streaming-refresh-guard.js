'use strict';
// In-memory demonstration of a per-work single-flight guard.
// NOT distributed: production must use atomic Redis lock with token-safe release.
const {decide}=require('./streaming-update-schedule');
function createGuard(){
 const inflight=new Map();
 async function run({type,id,record,at,watchOrder=false,scheduled=false,refresh}){
  if(!['movie','tv'].includes(type)||!Number.isSafeInteger(Number(id))||Number(id)<1)throw Error('invalid identity');
  if(typeof refresh!=='function')throw Error('missing refresh');
  const key=type+':'+Number(id);
  if(inflight.has(key))return inflight.get(key);
  const decision=decide(record,{at,watchOrder,scheduled});
  if(!decision.due)return {status:'skipped',reason:decision.reason};
  const task=(async()=>{try{return {status:'updated',value:await refresh()}}catch(error){return {status:'failed',error:String(error?.message||error)}}})();
  inflight.set(key,task);
  try{return await task}finally{if(inflight.get(key)===task)inflight.delete(key)}
 }
 return {run,pending:()=>inflight.size};
}
module.exports={createGuard};
