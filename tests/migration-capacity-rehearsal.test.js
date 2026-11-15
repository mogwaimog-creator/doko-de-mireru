'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn}=require('node:child_process');
const {createClient}=require('../scripts/lib/local-binary-redis');
const info=text=>Object.fromEntries(text.toString().split('\r\n').filter(x=>x.includes(':')).map(x=>{const i=x.indexOf(':');return [x.slice(0,i),x.slice(i+1)]}));
async function stop(p){if(p&&p.exitCode===null&&p.signalCode===null)await new Promise(r=>{p.once('exit',r);p.kill('SIGTERM')})}
async function start(dir){fs.mkdirSync(dir);const socketPath=path.join(dir,'redis.sock'),client=createClient({socketPath});const child=spawn(process.env.REDIS_TEST_SERVER,['--port','0','--unixsocket',socketPath,'--save','','--appendonly','no','--dir',dir,'--dbfilename','sample.rdb'],{stdio:'ignore'});child.on('error',()=>{});try{const until=Date.now()+8000;while(Date.now()<until){if(child.exitCode!==null)throw Error('Redis failed');try{await client.command(['PING']);return {client,child}}catch{}await new Promise(r=>setTimeout(r,20))}throw Error('Startup timeout')}catch(e){await stop(child);throw e}}
test('compressed RDB size is not a capacity estimate; noeviction OOM leaves an incomplete restore and preserves prior keys',{skip:!process.env.REDIS_TEST_SERVER},async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'capacity-'));let source,target;
 try{
  source=await start(path.join(root,'source'));target=await start(path.join(root,'target'));
  const payload='A'.repeat(32768),records=[];
  for(let i=0;i<64;i++){const key='synthetic:'+i;await source.client.command(['SET',key,payload]);records.push({key,dump:await source.client.command(['DUMP',key])})}
  await source.client.command(['SAVE']);const sourceMemory=info(await source.client.command(['INFO','memory'])),rdbBytes=fs.statSync(path.join(root,'source','sample.rdb')).size;
  assert(Number(sourceMemory.used_memory_dataset)>rdbBytes*4,'compression must materially understate resident dataset');
  await target.client.command(['SET','sentinel','keep']);
  const before=info(await target.client.command(['INFO','memory']));await target.client.command(['CONFIG','SET','maxmemory-policy','noeviction']);await target.client.command(['CONFIG','SET','maxmemory',String(Number(before.used_memory)+400000)]);
  let restored=0,oom=false;
  for(const r of records){try{await target.client.command(['RESTORE',r.key,'0',r.dump]);restored++}catch(e){assert.match(e.message,/OOM/);oom=true;break}}
  assert(oom);assert(restored<records.length);assert.equal((await target.client.command(['GET','sentinel'])).toString(),'keep');assert.equal(await target.client.command(['DBSIZE']),restored+1);
  for(const r of records.slice(0,restored))assert.equal((await target.client.command(['GET',r.key])).toString(),payload);
  assert.equal(Number(info(await target.client.command(['INFO','stats'])).evicted_keys),0);
  t.diagnostic(JSON.stringify({rdbBytes,sourceUsedMemory:Number(sourceMemory.used_memory),sourceDatasetBytes:Number(sourceMemory.used_memory_dataset),expected:64,restored,oom,evicted:0}));
 }finally{await stop(source?.child);await stop(target?.child);fs.rmSync(root,{recursive:true,force:true})}
});
