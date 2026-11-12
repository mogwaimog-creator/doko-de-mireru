'use strict';
// Transport-independent full-type DUMP backup. No network or deletion on import.
const {createHash}=require('node:crypto');
const sha=b=>createHash('sha256').update(b).digest('hex');
const SNAPSHOT="local v=redis.call('DUMP',KEYS[1]);if not v then return false end;local t=redis.call('TYPE',KEYS[1]);return {v,redis.call('PTTL',KEYS[1]),t.ok}";
const str=x=>Buffer.isBuffer(x)?x.toString():String(x);
async function scan(command,pattern,maxKeys){const keys=new Map();let cursor='0',rounds=0;do{const result=await command(['SCAN',cursor,'MATCH',pattern,'COUNT','128']);cursor=str(result[0]);for(const key of result[1]){const b=Buffer.isBuffer(key)?key:Buffer.from(key);keys.set(b.toString('base64'),b);if(keys.size>maxKeys)throw Error('backup key bound exceeded')}if(++rounds>100000)throw Error('scan bound exceeded')}while(cursor!=='0');return [...keys.values()].sort(Buffer.compare)}
async function backup(command,{writersStopped=false,pattern='*',maxKeys=100000,maxBytes=512*1024*1024,clock=Date.now}={}){
 if(!writersStopped)throw Error('all writers must be stopped before backup');
 const startedAt=clock(),keys=await scan(command,pattern,maxKeys),records=[];let bytes=0;
 for(const key of keys){const at=clock(),row=await command(['EVAL',SNAPSHOT,'1',key]);if(!row)continue;if(!Buffer.isBuffer(row[0]))throw Error('binary-safe DUMP transport required');const ttl=Number(row[1]);if(ttl===-2)continue;if(ttl< -1)throw Error('invalid expiry');const dump=row[0];bytes+=dump.length+key.length;if(bytes>maxBytes)throw Error('backup byte bound exceeded');records.push({key:key.toString('base64'),dump:dump.toString('base64'),sha256:sha(dump),type:str(row[2]),expiresAt:ttl<0?null:at+ttl})}
 // Freeze is an operational prerequisite. A second scan catches new/nonexpired missing keys.
 const recorded=new Set(records.map(r=>r.key)),second=await scan(command,pattern,maxKeys),expected=new Set(records.filter(r=>r.expiresAt===null||r.expiresAt>clock()).map(r=>r.key));
 for(const key of second)if(!recorded.has(key.toString('base64')))throw Error('keys changed during backup');
 for(const key of second)expected.delete(key.toString('base64'));if(expected.size)throw Error('keys disappeared during backup');
 const bundle={version:1,startedAt,finishedAt:clock(),pattern,count:records.length,rawBytes:bytes,records};return {bundle,sha256:sha(Buffer.from(JSON.stringify(bundle)))};
}
function validate(bundle,hash){if(sha(Buffer.from(JSON.stringify(bundle)))!==hash||bundle.version!==1||bundle.count!==bundle.records?.length)throw Error('backup manifest/hash mismatch');const seen=new Set();for(const r of bundle.records){if(seen.has(r.key)||sha(Buffer.from(r.dump,'base64'))!==r.sha256||!['string','hash','list','set','zset','stream'].includes(r.type)||!(r.expiresAt===null||Number.isFinite(r.expiresAt)))throw Error('invalid backup record');seen.add(r.key)}return true}
async function restoreIsolated(command,{bundle,sha256,prefix,clock=Date.now}){
 validate(bundle,sha256);if(!/^doko:dev:restore:[a-z0-9:-]+:$/.test(prefix))throw Error('new isolated restore namespace required');
 const targets=bundle.records.map(r=>Buffer.concat([Buffer.from(prefix),Buffer.from(r.key,'base64')]));
 // Never REPLACE existing keys. Preflight entire target before any write.
 for(const target of targets)if(Number(await command(['EXISTS',target])))throw Error('restore target exists');
 let restored=0,expired=0;for(let i=0;i<bundle.records.length;i++){const r=bundle.records[i],ttl=r.expiresAt===null?0:r.expiresAt-clock();if(r.expiresAt!==null&&ttl<=0){expired++;continue}await command(['RESTORE',targets[i],String(ttl),Buffer.from(r.dump,'base64')]);const copy=await command(['DUMP',targets[i]]);if(!Buffer.isBuffer(copy)||sha(copy)!==r.sha256)throw Error('restore verification failed');const restoredTtl=Number(await command(['PTTL',targets[i]]));if(r.expiresAt===null?restoredTtl!==-1:(restoredTtl<0||Math.abs(restoredTtl-(r.expiresAt-clock()))>1000))throw Error('restore TTL verification failed');restored++}return {restored,expired};
}
module.exports={backup,validate,restoreIsolated,SNAPSHOT};
