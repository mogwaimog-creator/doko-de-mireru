'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawn,execFileSync}=require('node:child_process');
const core=require('../scripts/lib/original-key-migration');
const {open}=require('../scripts/lib/migration-target-transport');
const serverPath=process.env.VALKEY_TEST_SERVER;
const sha='b'.repeat(64),prefix='doko:ledger:release:'+sha.slice(0,16)+':';
async function stop(p){if(p&&p.exitCode===null&&p.signalCode===null)await new Promise(r=>{p.once('exit',r);p.kill('SIGTERM')})}
async function start(dir){
 fs.mkdirSync(dir,{recursive:true});const socketPath=path.join(dir,'socket');
 const child=spawn(serverPath,['--port','0','--unixsocket',socketPath,'--save','','--appendonly','no','--dir',dir,'--dbfilename','data.rdb','--maxmemory','312475648','--maxmemory-policy','noeviction'],{stdio:'ignore'});child.on('error',()=>{});
 try{const end=Date.now()+8000;while(Date.now()<end){if(child.exitCode!==null)throw Error('local server stopped');if(fs.existsSync(socketPath)){
 const raw=require('redis').createClient({socket:{path:socketPath,reconnectStrategy:false},disableClientInfo:true});raw.on('error',()=>{});await raw.connect();
 const command=args=>raw.sendCommand(args.map(x=>Buffer.isBuffer(x)?x:String(x)),{typeMapping:{[require('redis').RESP_TYPES.BLOB_STRING]:Buffer}});
 const client={command,async pipeline(batch){const out=[];for(const args of batch)out.push(await command(args));return out},close(){if(raw.isOpen)raw.destroy()}};
 return {child,client,socketPath};}await new Promise(r=>setTimeout(r,20))}throw Error('local startup timeout')}catch(e){await stop(child);throw e}
}
const send=client=>core.transport(client,{maxCommands:100000,maxArgumentBytes:256*1024*1024});
async function fixture(client){
 await client.pipeline([
  ['SET',prefix+'work:v2:movie:1','{"id":1,"title":"固定映画","revision":2,"lockedFields":["title"],"pageExtras":{"manual":"手動"}}'],
  ['SET',prefix+'work:v2:tv:2','{"id":2,"title":"固定TV"}'],['SET',prefix+'seo:v1:movie:1','{"title":"固定SEO"}'],
  ['SET',prefix+'person:v2:3','{"id":3,"name":"人物","cast":[{"id":1}]}'],['SET',prefix+'season:v1:tv:2','{"tvId":2,"seasons":[]}'],
  ['SET',prefix+'shared-stream:v1:record:movie:1','{"flatrate":[],"lastSuccessAt":"2026-11-01T00:00:00Z"}'],
  ['HSET',prefix+'cutover:v1:active','owner','token'],['RPUSH',prefix+'ops:history','first','last'],
  ['ZADD',prefix+'search:v2:ids:work','1','movie:1'],['SADD','unknown-set','a','b'],['XADD',prefix+'ops:events','*','value','event'],
  ['XGROUP','CREATE',prefix+'ops:events','synthetic-group','0'],['XREADGROUP','GROUP','synthetic-group','synthetic-consumer','COUNT','1','STREAMS',prefix+'ops:events','>'],
  ['SET',prefix+'content-control:v1','{"status":"paused"}'],['SET','expiring','expires','PXAT',String(Date.now()+600000)],
  ['SET','',Buffer.from([0,255,128])],['SELECT','2'],['SET',Buffer.from([0,255]),Buffer.from([128,0,255])],['SELECT','0'],['SAVE']]);
}
async function environment(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'original-keys-')),processes=[];const launch=async(name)=>{const s=await start(path.join(root,name));processes.push(s);return s};try{await fn({root,launch,processes})}finally{for(const s of processes){s.client.close();await stop(s.child);}fs.rmSync(root,{recursive:true,force:true})}}
const capture=s=>core.capture(send(s.client),{rdbSha256:'a'.repeat(64),releaseSha256:sha,writersStopped:true,exportComplete:true});
const skip={skip:!serverPath};
test('Valkey9.1.3 RDB -> verified bundle -> original keys in all DBs; six types and every ledger preserved',skip,async()=>environment(async({root,launch,processes})=>{
 const source=await launch('source');await fixture(source.client);await stop(source.child);
 fs.mkdirSync(path.join(root,'loaded'));fs.copyFileSync(path.join(root,'source','data.rdb'),path.join(root,'loaded','data.rdb'));
 const loaded=await start(path.join(root,'loaded'));processes.push(loaded);const bundle=await capture(loaded);
 assert.equal(bundle.databases.length,2);assert.equal(new Set(bundle.databases.flatMap(d=>d.proof.records.map(r=>r.type))).size,6);
 const rehearsalTarget=await launch('rehearsal'),events=[];
 const report=await core.restore(send(rehearsalTarget.client),bundle,{writersStopped:true,localRehearsal:true,journal:async e=>events.push(e)});
 assert.equal(report.verification.status,'PASS');assert(events.some(e=>e.phase==='intent'));assert(events.at(-1).phase==='verified');
 assert.equal(report.verification.families.work,2);assert.equal(report.verification.families.person,1);assert.equal(report.verification.families.season,1);assert.equal(report.verification.families.streaming,1);assert.equal(report.verification.families['search-index'],1);assert.equal(report.verification.baselineWarnings.length,0);
 const target=await launch('target');const result=await core.restore(send(target.client),bundle,{writersStopped:true,rehearsal:report,journal:async()=>{}});assert.equal(result.status,'PASS');
 assert.equal((await core.verify(send(target.client),bundle)).verified,15);
 await target.client.command(['SELECT','0']);
 assert.equal((await target.client.command(['GET',prefix+'work:v2:movie:1'])).toString(),'{"id":1,"title":"固定映画","revision":2,"lockedFields":["title"],"pageExtras":{"manual":"手動"}}');
 await assert.rejects(core.restore(send(target.client),bundle,{writersStopped:true,rehearsal:report,journal:async()=>{}}),/NONEMPTY_TARGET/);
}));
test('missing/extra/value/TTL/type corruption, extra DB and stale report fail closed',skip,async()=>environment(async({launch})=>{
 const source=await launch('source');await fixture(source.client);const bundle=await capture(source);
 const target=await launch('target');let events=[];const opts={writersStopped:true,localRehearsal:true,journal:async e=>events.push(e)};
 const report=await core.restore(send(target.client),bundle,opts);
 await target.client.command(['SELECT','0']);await target.client.command(['SET','extra','x']);await assert.rejects(core.verify(send(target.client),bundle),/EXTRA_KEY/);await target.client.command(['DEL','extra']);
 await target.client.command(['SET','expiring','expires']);await assert.rejects(core.verify(send(target.client),bundle),/MISMATCH/);await target.client.command(['PEXPIREAT','expiring',String(bundle.databases[0].archive.records.find(r=>Buffer.from(r.key,'base64').toString()==='expiring').expiresAt)]);
 await target.client.command(['SET',prefix+'work:v2:movie:1','tampered']);await assert.rejects(core.verify(send(target.client),bundle),/MISMATCH/);
 await target.client.command(['DEL',prefix+'work:v2:movie:1']);await assert.rejects(core.verify(send(target.client),bundle),/MISSING_KEY/);
 const empty=await launch('empty');await assert.rejects(core.restore(send(empty.client),bundle,{writersStopped:true,rehearsal:{...report,bundleSha256:'f'.repeat(64)},journal:async()=>{}}),/CHECKSUM/);assert.equal(await empty.client.command(['DBSIZE']),0);
 const changed=structuredClone(bundle);changed.databases[0].archive.records.push(changed.databases[0].archive.records[0]);changed.databases[0].archive.count++;changed.databases[0].archive=core.seal(changed.databases[0].archive);await assert.rejects(core.verify(send(empty.client),core.seal(changed)),/hash|invalid/);
}));
test('expiry accounted without resurrection; interruption, journal failure and unknown write never replay',skip,async()=>environment(async({launch})=>{
 const source=await launch('source');await fixture(source.client);let bundle=await capture(source);
 // Synthetic already-expired record: same bytes/proof, change only its absolute deadline and reseal.
 const db=bundle.databases[0],i=db.archive.records.findIndex(r=>Buffer.from(r.key,'base64').toString()==='expiring');db.archive.records[i].expiresAt=Date.now()-1000;db.archive=core.seal(db.archive);db.proof.archiveSha256=db.archive.sha256;db.proof=core.seal(db.proof);bundle=core.seal(bundle);
 const target=await launch('target');const report=await core.restore(send(target.client),bundle,{writersStopped:true,localRehearsal:true,journal:async()=>{}});assert.equal(report.expired,1);assert.equal(report.verification.expired,1);await target.client.command(['SELECT','0']);assert.equal(await target.client.command(['GET','expiring']),null);
 for(const mode of ['abort','journal','unknown']){
  const t=await launch(mode),controller=new AbortController();let attempts=0;const backend={command:async args=>{if(args[0]==='RESTORE'){attempts++;await t.client.command(args);throw Error('synthetic uncertain reply')}return t.client.command(args)},pipeline:args=>t.client.pipeline(args)};
  await assert.rejects(core.restore(send(mode==='unknown'?backend:t.client),bundle,{writersStopped:true,localRehearsal:true,signal:controller.signal,journal:async e=>{if(e.phase==='intent'){if(mode==='abort')controller.abort();if(mode==='journal')throw Error('synthetic disk full')}}}));
  if(mode==='unknown')assert.equal(attempts,1);else assert.equal(await t.client.command(['DBSIZE']),0);
 }
}));
test('capacity projection and noeviction gates prevent writes; runtime OOM stops without deletion',skip,async()=>environment(async({launch})=>{
 const source=await launch('source');await source.client.command(['SET',prefix+'work:v2:movie:1','x'.repeat(500000)]);const bundle=await capture(source);
 const t=await launch('t');let writes=0;const wrapped={command:args=>{if(args[0]==='RESTORE')writes++;return t.client.command(args)},pipeline:batch=>t.client.pipeline(batch)};
 await t.client.command(['CONFIG','SET','maxmemory-policy','allkeys-lru']);await assert.rejects(core.restore(send(wrapped),bundle,{writersStopped:true,localRehearsal:true,journal:async()=>{}}),/CAPACITY/);assert.equal(writes,0);
 await t.client.command(['CONFIG','SET','maxmemory-policy','noeviction']);await t.client.command(['CONFIG','SET','maxmemory','2000000']);await assert.rejects(core.restore(send(wrapped),bundle,{writersStopped:true,localRehearsal:true,maxmemory:2000000,journal:async()=>{}}),/CAPACITY/);assert.equal(writes,0);
}));
test('binary TLS Aiven transport uses one authenticated connection, strict hostname/CA, stops on auth/timeout and forbids deletes',skip,async()=>environment(async({root,launch})=>{
 const tls=require('node:tls'),net=require('node:net');const target=await launch('tls-target');
 // Local Valkey Unix socket behind TLS. Synthetic credentials only; no remote DNS or network.
 await target.client.command(['CONFIG','SET','requirepass','synthetic-local-password']);
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(root,'key'),'-out',path.join(root,'cert'),'-days','1','-subj','/CN=local.aivencloud.com','-addext','subjectAltName=DNS:local.aivencloud.com'],{stdio:'ignore'});
 const sockets=new Set(),ca=fs.readFileSync(path.join(root,'cert'));
 const server=tls.createServer({key:fs.readFileSync(path.join(root,'key')),cert:ca},down=>{const up=net.createConnection(target.socketPath);sockets.add(up);up.on('close',()=>sockets.delete(up));up.on('error',()=>down.destroy());down.on('error',()=>{});down.on('close',()=>up.destroy());down.pipe(up).pipe(down)});
 server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))});server.on('tlsClientError',()=>{});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const factory=o=>require('redis').createClient({...o,socket:{...o.socket,host:'127.0.0.1'}}),config={host:'local.aivencloud.com',port:server.address().port,username:'default',password:'synthetic-local-password',ca};let client;
 try{
  client=await open({...config,allowRestore:true},factory);const bytes=Buffer.from([0,255,128]);
  const local=require('redis').createClient({socket:{path:target.socketPath},password:config.password});local.on('error',()=>{});await local.connect();await local.sendCommand(['SET','synthetic-key',bytes]);const dump=await local.sendCommand(['DUMP','synthetic-key'],{typeMapping:{[require('redis').RESP_TYPES.BLOB_STRING]:Buffer}});local.destroy();
  assert(Buffer.isBuffer(await client.command(['DUMP','synthetic-key'])));await client.command(['RESTORE',Buffer.from([0,255]),'0',dump]);assert.deepEqual(await client.command(['GET',Buffer.from([0,255])]),bytes);
  await assert.rejects(client.command(['DEL','synthetic-key']),/FORBIDDEN/);await assert.rejects(client.command(['RESTORE','key','0',dump,'REPLACE']),/FORBIDDEN/);
  client.close();await assert.rejects(open({...config,password:'wrong'},factory),/TARGET_IO_STOP/);await assert.rejects(open({...config,ca:undefined},factory),/TARGET_IO_STOP/);await assert.rejects(open({...config,host:'wrong.aivencloud.com'},factory),/TARGET_IO_STOP/);
  await assert.rejects(open({...config,host:'upstash.invalid'},factory),/AIVEN_HOST_REQUIRED/);
 }finally{client?.close();for(const s of sockets)s.destroy();await new Promise(r=>server.close(r))}
}));

test('type mismatch, additional database, raw-byte binary mismatch and source orphan are detected',skip,async()=>environment(async({launch})=>{
 const source=await launch('source');await fixture(source.client);const bundle=await capture(source);
 for(const mode of ['type','extra-db','binary']){
  const target=await launch(mode);await core.restore(send(target.client),bundle,{writersStopped:true,localRehearsal:true,journal:async()=>{}});await target.client.command(['SELECT','0']);
  if(mode==='type'){await target.client.command(['DEL','unknown-set']);await target.client.command(['RPUSH','unknown-set','a','b'])}
  if(mode==='extra-db'){await target.client.command(['SELECT','3']);await target.client.command(['SET','outside','x'])}
  if(mode==='binary')await target.client.command(['SET','',Buffer.from([0,255,129])]);
  await assert.rejects(core.verify(send(target.client),bundle),mode==='extra-db'?/EXTRA_DATABASE/:/MISMATCH/);
 }
 await source.client.command(['SELECT','0']);await source.client.command(['SET',prefix+'seo:v1:movie:999','{"title":"orphan"}']);const orphan=await capture(source);assert.equal(core.ledgerSummary(orphan).baselineWarnings.length,1);
 const empty=await launch('orphan-target');await assert.rejects(core.restore(send(empty.client),orphan,{writersStopped:true,localRehearsal:true,journal:async()=>{}}),/REFERENCE_REVIEW/);assert.equal(await empty.client.command(['DBSIZE']),0);
}));

test('projected capacity, runtime OOM, eviction observation and invalid record bounds stop without replay',skip,async()=>environment(async({launch})=>{
 const source=await launch('source');await fixture(source.client);const bundle=await capture(source),r=await launch('r');
 const report=await core.restore(send(r.client),bundle,{writersStopped:true,localRehearsal:true,journal:async()=>{}});
 const target=await launch('target');const oversized=core.seal({...report,incrementBytes:312475648});
 await assert.rejects(core.restore(send(target.client),bundle,{writersStopped:true,rehearsal:oversized,journal:async()=>{}}),/CAPACITY_PROJECTION/);assert.equal(await target.client.command(['DBSIZE']),0);
 let attempts=0;
 const wrapped={async command(args){if(args[0]==='RESTORE'){attempts++;await target.client.command(['CONFIG','SET','maxmemory','1'])}return target.client.command(args)},pipeline:batch=>target.client.pipeline(batch)};
 await assert.rejects(core.restore(send(wrapped),bundle,{writersStopped:true,localRehearsal:true,journal:async()=>{}}),/OOM/);assert.equal(attempts,1);assert.equal(await target.client.command(['DBSIZE']),0);
 const eTarget=await launch('eviction-observation');let statsCalls=0;const evictTransport={async command(args){const result=await eTarget.client.command(args);if(args[0]==='INFO'&&args[1]==='stats'&&++statsCalls>1)return Buffer.from(result.toString().replace(/evicted_keys:\d+/, 'evicted_keys:1'));return result},pipeline:batch=>eTarget.client.pipeline(batch)};await assert.rejects(core.restore(send(evictTransport),bundle,{writersStopped:true,localRehearsal:true,journal:async()=>{}}),/CAPACITY_OR_POLICY/);assert.equal(await eTarget.client.command(['DBSIZE']),0);
 const huge=structuredClone(bundle);huge.databases[0].proof.records[0].memoryBytes=-1;huge.databases[0].proof=core.seal(huge.databases[0].proof);assert.throws(()=>core.validateBundle(core.seal(huge)),/RECORD_BOUND/);
}));

test('transport connect/command timeout destroys socket, no retry; durable journal refuses overwrite',async()=>{
 for(const phase of ['connect','command']){
  let connects=0,sends=0,destroys=0;
  const mock={isOpen:false,on(){},connect(){connects++;this.isOpen=true;return phase==='connect'?new Promise(()=>{}):Promise.resolve()},sendCommand(){sends++;return new Promise(()=>{})},destroy(){destroys++;this.isOpen=false}};
  const config={host:'synthetic.aivencloud.com',port:1234,username:'default',password:'synthetic',timeoutMs:25};
  if(phase==='connect')await assert.rejects(open(config,()=>mock),/TARGET_IO_STOP/);
  else{const transport=await open(config,()=>mock);await assert.rejects(transport.command(['INFO','memory']),/TARGET_IO_STOP/);await assert.rejects(transport.command(['TIME']),/FORBIDDEN/)}
  assert.equal(connects,1);assert.equal(sends,phase==='connect'?0:1);assert.equal(destroys,1);
 }
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'journal-'));try{const {journalFile,hashFile}=require('../scripts/original-key-migration'),file=path.join(root,'log'),journal=journalFile(file);await journal.append({phase:'intent',db:0,index:0});journal.close();assert.throws(()=>journalFile(file),/EEXIST/);assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),{phase:'intent',db:0,index:0});assert.equal(await hashFile(file),core.hash(fs.readFileSync(file)));}finally{fs.rmSync(root,{recursive:true,force:true})}
});
