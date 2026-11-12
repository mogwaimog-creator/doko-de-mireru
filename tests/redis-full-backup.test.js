'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {command}=require('../scripts/lib/local-binary-redis'),{backup,validate,restoreIsolated}=require('../scripts/lib/redis-full-backup');
const local=(name,fn)=>test(name,{skip:!process.env.REDIS_TEST_CLI},fn);
local('all six Redis types, binary data and TTL survive isolated DUMP backup/restore',async()=>{
 const source=`doko:dev:backup:${process.pid}:${Date.now()}:`,prefix=`doko:dev:restore:${process.pid}:${Date.now()}:`;
 await command(['SET',source+'string',Buffer.from([0,255,128,10,13]),'PX','60000']);await command(['HSET',source+'hash','manual','保護','lock','true']);await command(['RPUSH',source+'list','third','first']);await command(['SADD',source+'set','a','b']);await command(['ZADD',source+'zset','1.5','a','2','b']);await command(['XADD',source+'stream','*','event','preserved']);
 const result=await backup(command,{writersStopped:true,pattern:source+'*'});assert.equal(result.bundle.count,6);assert(validate(result.bundle,result.sha256));
 const restored=await restoreIsolated(command,{...result,prefix});assert.equal(restored.restored,6);assert.deepEqual(await command(['GET',prefix+source+'string']),Buffer.from([0,255,128,10,13]));assert(Number(await command(['PTTL',prefix+source+'string']))>0);assert.equal(Number(await command(['PTTL',prefix+source+'hash'])),-1);
 await assert.rejects(restoreIsolated(command,{...result,prefix}),/exists/);const bad=structuredClone(result.bundle);bad.records[0].dump='corrupt';assert.throws(()=>validate(bad,result.sha256),/hash/);
});
local('backup refuses live writers and growing snapshots; restore never targets original namespace',async()=>{
 await assert.rejects(backup(command),/writers/);const prefix=`doko:dev:backup:bound:${Date.now()}:`;await command(['SET',prefix+'a','protected']);await assert.rejects(backup(command,{writersStopped:true,pattern:prefix+'*',maxBytes:1}),/bound/);
 const result=await backup(command,{writersStopped:true,pattern:prefix+'*'});await assert.rejects(restoreIsolated(command,{...result,prefix:'doko:watch:v3:'}),/isolated/);assert.equal((await command(['GET',prefix+'a'])).toString(),'protected');
});
