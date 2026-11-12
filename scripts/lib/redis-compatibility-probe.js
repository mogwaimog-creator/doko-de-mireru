'use strict';
// Explicit injected transport only. Never discovers credentials or contacts a service.
const {randomUUID}=require('node:crypto');
async function probe(command,{prefix='doko:dev:compat:'+randomUUID()+':',clock=Date.now}={}){
 if(typeof command!=='function'||!/^doko:dev:compat:[a-z0-9:-]+:$/.test(prefix))throw Error('explicit isolated probe transport/prefix required');
 const counts={rpcs:0,requestArgumentBytes:0},checks=[];
 async function send(args){if(counts.rpcs>=40)throw Error('probe budget exhausted');counts.rpcs++;counts.requestArgumentBytes+=args.reduce((n,v)=>n+Buffer.byteLength(String(v)),0);return command(args)}
 const own=prefix+'owner';if(await send(['SET',own,'probe','NX','PX','60000'])!=='OK')throw Error('probe namespace already exists');
 async function check(name,fn){try{if(!await fn())throw Error('unexpected response');checks.push({name,passed:true})}catch{checks.push({name,passed:false})}}
 await check('MSET/MGET preserve exact JSON and empty arrays',async()=>{const raw=JSON.stringify({japan:{flatrate:[],rent:[],buy:[]},cast:[{id:1,name:'日本語'}]});const ok=await send(['EVAL',"redis.call('MSET',KEYS[1],ARGV[1],KEYS[2],ARGV[1]);redis.call('PEXPIRE',KEYS[1],60000);redis.call('PEXPIRE',KEYS[2],60000);return redis.call('MGET',unpack(KEYS))",'2',prefix+'a',prefix+'b',raw]);return Array.isArray(ok)&&ok.every(x=>x===raw)});
 await check('Lua owner fencing and raw string CAS',async()=>{const script="if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end;if redis.call('GET',KEYS[2])~=ARGV[2] then return 0 end;return 1";const raw=await send(['GET',prefix+'a']);return Number(await send(['EVAL',script,'2',own,prefix+'a','wrong',raw]))===0&&Number(await send(['EVAL',script,'2',own,prefix+'a','probe',raw]))===1});
 await check('PXAT/PEXPIREAT and PTTL',async()=>{const expires=clock()+60000;await send(['SET',prefix+'expiry','value','PXAT',String(expires)]);await send(['PEXPIREAT',prefix+'expiry',String(expires)]);const ttl=Number(await send(['PTTL',prefix+'expiry']));return ttl>0&&ttl<=60000});
 await check('bounded active-request hash',async()=>{await send(['HSET',prefix+'active','ticket','{}']);await send(['PEXPIRE',prefix+'active','60000']);const n=Number(await send(['HLEN',prefix+'active']));await send(['HDEL',prefix+'active','ticket']);return n===1});
 await check('Lua progress delta JSON keeps identity and map entries',async()=>{const result=await send(['EVAL',"local old=cjson.decode(ARGV[1]);local delta=cjson.decode(ARGV[2]);for k,v in pairs(delta.done) do old.done[k]=v end;return cjson.encode(old)",'0',JSON.stringify({keys:['movie:1','tv:1'],done:{'movie:1':'success'}}),JSON.stringify({done:{'tv:1':'failed'}})]);const value=JSON.parse(result);return value.keys.length===2&&value.done['movie:1']==='success'&&value.done['tv:1']==='failed'});
 return {scope:'only newly owned development probe keys; no production credentials, reset, scan or export',complete:checks.every(c=>c.passed),checks,...counts,maxRPCs:40,fullBackupBinaryTransport:'not covered: DUMP/RESTORE/RDB export and REST binary decoding must be separately verified',billing:'Provider metering, command size/time limits, actual free quota and charges remain unverified. No remote adapter included.'};
}
module.exports={probe};
