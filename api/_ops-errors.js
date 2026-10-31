'use strict';
// Operational error journal shared by future work/person/streaming ledgers.
// Events are stored separately from fixed metadata, so metadata refreshes
// cannot silently erase errors. No secrets, tokens, or stack traces are stored.
const {command}=require('./_redis');
const KEY='doko:ops:errors:v1';
const MAX=500;
const TYPES=new Set(['work','person','streaming','series','feature','system']);
function safe(value,max=200){return typeof value==='string'?value.trim().slice(0,max):'';}
function normalize(input){
 if(!input||typeof input!=='object')throw Error('Invalid error event');
 const area=safe(input.area,40);
 if(!TYPES.has(area))throw Error('Invalid error area');
 const code=safe(input.code,80);
 if(!/^[A-Za-z0-9_.-]{1,80}$/.test(code))throw Error('Invalid error code');
 return {
  eventId:globalThis.crypto.randomUUID(),
  area,code,
  type:['movie','tv'].includes(input.type)?input.type:null,
  id:Number.isSafeInteger(Number(input.id))&&Number(input.id)>0?Number(input.id):null,
  page:safe(input.page,100)||null,
  message:safe(input.message,240)||'エラーが発生しました',
  occurredAt:new Date().toISOString(),
  status:'open'
 };
}
async function recordError(input,{write=command}={}){
 const event=normalize(input);
 await write(['LPUSH',KEY,JSON.stringify(event)]);
 await write(['LTRIM',KEY,0,MAX-1]);
 return event;
}
async function listErrors({limit=50,read=command}={}){
 const n=Math.max(1,Math.min(100,Number(limit)||50));
 const raw=await read(['LRANGE',KEY,0,n-1]);
 return (raw||[]).flatMap(v=>{try{return [typeof v==='string'?JSON.parse(v):v]}catch{return []}});
}
module.exports={recordError,listErrors,normalize,KEY};
