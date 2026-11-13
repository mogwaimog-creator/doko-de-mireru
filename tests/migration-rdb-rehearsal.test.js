'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawn}=require('node:child_process');
const {createClient}=require('../scripts/lib/local-binary-redis');
const {transport,snapshot,proofFromLocal,restoreVerified}=require('../scripts/lib/redis-low-command-backup');
const {inventory}=require('../scripts/lib/migration-inventory');
async function stop(child){if(child&&child.exitCode===null&&child.signalCode===null)await new Promise(resolve=>{child.once('exit',resolve);child.kill('SIGTERM')})}
async function start(directory){
 fs.mkdirSync(directory,{recursive:true});const socketPath=path.join(directory,'redis.sock'),client=createClient({socketPath});
 const child=spawn(process.env.REDIS_TEST_SERVER,['--port','0','--unixsocket',socketPath,'--unixsocketperm','700','--save','','--appendonly','no','--dir',directory,'--dbfilename','export.rdb','--logfile',path.join(directory,'redis.log')],{stdio:'ignore'});
 child.on('error',()=>{});
 try{const deadline=Date.now()+8000;while(Date.now()<deadline){if(child.exitCode!==null)throw Error('local RDB load failed');try{if(await client.command(['PING'])==='PONG')return {child,client}}catch{}await new Promise(resolve=>setTimeout(resolve,20))}throw Error('local RDB startup timed out')}catch(e){await stop(child);throw e}
}
function database(client,index){return {async command(args){return (await client.pipeline([['SELECT',String(index)],args]))[1]},async pipeline(batch){return (await client.pipeline([['SELECT',String(index)],...batch])).slice(1)}}}
test('RDB reload retains all six types and separate logical databases, then reuses existing backup/proof/restore', {skip:!process.env.REDIS_TEST_SERVER},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'doko-rdb-'));let source,target;
 const release='b'.repeat(64),prefix='doko:ledger:release:'+release.slice(0,16)+':',expiry=Date.now()+60000;
 try{
  source=await start(path.join(root,'source'));
  await source.client.pipeline([['SET',prefix+'work:v2:movie:1','{"title":"固定名","lockedFields":["title"],"pageExtras":{"manual":"手動"}}'],['HSET',prefix+'cutover:v1:active','token','ticket'],['RPUSH',prefix+'ops:v1:history','first','last'],['SADD',prefix+'legacy-set','a','b'],['ZADD',prefix+'search:v2:grams:work','1.5','term'],['XADD',prefix+'ops:v1:events','*','event','history'],['SET',prefix+'shared-stream:v1:lock:movie:1','owner','PXAT',String(expiry)],['SELECT','2'],['SET',Buffer.from([0,255]),Buffer.from([0,255,128])],['SAVE']]);
  await stop(source.child);
  const file=path.join(root,'source','export.rdb');assert(fs.statSync(file).size>0);fs.mkdirSync(path.join(root,'target'));fs.copyFileSync(file,path.join(root,'target','export.rdb'));
  target=await start(path.join(root,'target'));
  const info=(await target.client.command(['INFO','keyspace'])).toString();assert.match(info,/db0:/);assert.match(info,/db2:/);
  const reports=[];
  for(const db of [0,2]){const local=database(target.client,db),archive=await snapshot(transport(local),{writersStopped:true,pattern:'*'}),proof=await proofFromLocal(transport(local),archive,{prefix:'doko:dev:restore:rdb-proof:'}),result=await restoreVerified(transport(local),archive,proof,{prefix:'doko:dev:restore:rdb-target:'});assert.equal(result.complete,true);reports.push(inventory(archive,proof,{activeReleaseSha256:release,dbIndex:db}))}
  assert.equal(reports[0].count,7);assert.equal(Object.keys(reports[0].types).length,6);assert.equal(reports[1].count,1);assert.equal(reports[1].families.unknown,1);
  assert.equal(await target.client.command(['PEXPIRETIME',prefix+'shared-stream:v1:lock:movie:1']),expiry);
  assert.deepEqual(await database(target.client,2).command(['GET',Buffer.from([0,255])]),Buffer.from([0,255,128]));
 }finally{await stop(source?.child);await stop(target?.child);fs.rmSync(root,{recursive:true,force:true})}
});
