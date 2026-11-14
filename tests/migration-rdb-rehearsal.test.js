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

test('Japanese work/person search and browsing survive RDB reload without Redis Search or index rebuild', {skip:!process.env.REDIS_TEST_SERVER},async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'doko-search-rdb-'));let source,target;
 const sha=require('node:crypto').randomBytes(32).toString('hex'),operations=[];
 function binding(local){const decode=v=>Buffer.isBuffer(v)?v.toString('utf8'):Array.isArray(v)?v.map(decode):v;const transport=require('../api/_release-transport-candidate').createTransport({endpoint:'https://redis.invalid',token:'synthetic-rdb-search-token',releaseSha256:sha,phase:'new',enabled:true,scripts:require('../api/_release-transport-candidate').coreScripts(),request:async(_url,options)=>{const args=JSON.parse(options.body);operations.push(args[0]);assert(!/^(SEARCH\.|FT\.)/.test(args[0]));return new Response(JSON.stringify({result:decode(await local.command(args))}))}});return require('../api/_release-connection').bind(transport)}
 const queries=[{query:'保存映画',type:'all'},{personSearch:'保存俳優'},{genreBrowse:'1',genre:'action',type:'all'}];
 const clock=()=>Date.parse('2026-11-14T00:00:00Z');
 async function search(command){operations.length=0;const result=[];for(const q of queries)result.push(await require('../api/_paused-ledger-search').search(q,{command,clock}));assert(operations.every(op=>['EVAL','ZRANGEBYLEX','ZRANGE','MGET'].includes(op)));return result}
 try{
  source=await start(path.join(root,'source'));const command=binding(source.client),store=require('../api/_dev-content-store').contentStore(command);
  const work=require('../api/_work-ledger-v2-schema').normalizeWorkV2('movie',93000001,{title:'保存映画アクション',originalTitle:'Saved Movie',overview:'固定された概要',genres:['アクション'],releaseDate:'2025-01-01'});
  const person=require('../prototype/person-ledger').store().success({id:93000002,name:'保存俳優',cast:[{id:work.id,media_type:'movie',title:work.title}]},'2026-11-01T00:00:00Z');
  assert((await store.commit([{key:store.keys.work('movie',work.id),revision:0,data:work},{key:store.keys.person(93000002),revision:0,data:person}])).saved);
  const before=await search(command);assert.equal(before[0].results[0].id,work.id);assert.equal(before[1].results[0].id,93000002);assert.equal(before[2].results[0].id,work.id);
  const indexPrefix='doko:dev:search:v2:';for(const kind of ['work','person']){assert.equal(await command(['TYPE',indexPrefix+'ids:'+kind]),'zset');assert.equal(await command(['TYPE',indexPrefix+'grams:'+kind]),'zset')}
  await source.client.command(['SAVE']);await stop(source.child);fs.mkdirSync(path.join(root,'target'));fs.copyFileSync(path.join(root,'source','export.rdb'),path.join(root,'target','export.rdb'));
  target=await start(path.join(root,'target'));const restored=binding(target.client);assert.deepEqual(await search(restored),before);
  assert.equal(await restored(['GET',store.keys.work('movie',work.id)]),JSON.stringify(work));
 }finally{await stop(source?.child);await stop(target?.child);fs.rmSync(root,{recursive:true,force:true})}
});
