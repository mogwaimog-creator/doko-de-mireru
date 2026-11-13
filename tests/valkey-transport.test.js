'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {createValkey}=require('../api/_valkey');
const transport=require('../api/_release-transport-candidate'),connection=require('../api/_release-connection');
const SHA=randomBytes(32).toString('hex');
function env(extra={}){return {REDIS_PROVIDER:'valkey',REDIS_URL:'redis://127.0.0.1:16379',LEDGER_RELEASE_MODE:'new',LEDGER_RELEASE_SHA256:SHA,LEDGER_RELEASE_READY_SHA256:SHA,TMDB_API_KEY:'mock',LEDGER_ADMIN_TOKEN:'a'.repeat(32),CRON_SECRET:'c'.repeat(32),LEDGER_UPSTREAM_DAILY_LIMIT:'300',...extra}}
test('lazy initialization, verified TLS and no fallback/replay on command failure',async()=>{
 let creations=0,opens=0,sends=0,options;
 const backend=createValkey(env({REDIS_URL:'rediss://user:password@example.invalid:1234',REDIS_CA_CERT:'test-ca'}),{createClient:o=>{creations++;options=o;return {isOpen:false,on(){},async connect(){opens++;this.isOpen=true},async sendCommand(){sends++;throw Error('secret-server-error')},destroy(){}}}});
 assert.equal(creations,0);await assert.rejects(backend.command(['GET','owned:key']),/^Error: Valkey command failed/);assert.equal(creations,1);assert.equal(opens,1);assert.equal(sends,1);assert.equal(options.disableOfflineQueue,true);assert.equal(options.socket.reconnectStrategy,false);assert.equal(options.socket.tls,true);assert.equal(options.socket.ca,'test-ca');
 assert.throws(()=>createValkey(env({REDIS_URL:'redis://external.invalid:6379'})),/TLS/);
 assert.throws(()=>createValkey(env({NODE_ENV:'production'})),/TLS/);
 assert.throws(()=>createValkey(env({REDIS_URL:'rediss://host.invalid/?rejectUnauthorized=false'})),/options/);
 assert.throws(()=>connection.configuration(env({REDIS_URL:''})),/incomplete/);
 assert.throws(()=>connection.connect({env:env({REDIS_PROVIDER:'invalid'})}),/incomplete|provider/);
});
test('concurrent cold requests await the same connection before sending',async()=>{
 let opens=0,sends=0,ready=false,release;
 const backend=createValkey(env(),{createClient:()=>({isOpen:false,on(){},async connect(){opens++;this.isOpen=true;await new Promise(resolve=>{release=resolve});ready=true},async sendCommand(){assert(ready);sends++;return 'OK'},destroy(){}})});
 const first=backend.command(['GET','key']),second=backend.command(['GET','key']);assert.equal(sends,0);release();assert.deepEqual(await Promise.all([first,second]),['OK','OK']);assert.equal(opens,1);assert.equal(sends,2);backend.close();
});
test('Valkey wire preserves RESP strings/null/numbers/arrays and release safeguards', {skip:!process.env.REDIS_TEST_CLI},async()=>{
 const backend=createValkey(env()),client=transport.createTransport({endpoint:'https://valkey.invalid',token:'internal-valkey-transport-token',releaseSha256:SHA,phase:'new',enabled:true,request:backend.request,scripts:transport.coreScripts()}),command=connection.bind(client);
 try{
  assert.equal(await command(['GET','doko:dev:work:v2:movie:92000001']),null);
  assert.equal(await command(['SET','doko:dev:work:v2:movie:92000001','日本語']), 'OK');
  assert.deepEqual(await command(['MGET','doko:dev:work:v2:movie:92000001','doko:dev:work:v2:movie:92000002']),['日本語',null]);
  assert.equal(await command(['SET','doko:dev:test:lock','token','NX','PX','10000']),'OK');assert.equal(await command(['SET','doko:dev:test:lock','other','NX','PX','10000']),null);
  const store=require('../api/_shared-streaming-store').sharedStore(command);assert.equal(await store.acquire('movie:92000003','owner',10000),true);assert.equal(await store.release('movie:92000003','wrong'),false);assert.equal(await store.release('movie:92000003','owner'),true);
  const before=client.stats.requests;await assert.rejects(command(['EVAL','return 1','0']),/unregistered/);await assert.rejects(command(['SCAN','0']),/forbidden/);await assert.rejects(command(['GET','foreign:key']),/canonical/);assert.equal(client.stats.requests,before);
  const paused=transport.createTransport({endpoint:'https://valkey.invalid',token:'internal-valkey-transport-token',releaseSha256:SHA,phase:'paused',enabled:true,request:backend.request});await assert.rejects(paused.command(['SET','doko:dev:test:key','x']),/paused/);assert.equal(paused.stats.requests,0);
 }finally{backend.close()}
});
test('production connection selects native transport without any REST fetch', {skip:!process.env.REDIS_TEST_CLI},async()=>{
 const isolated=env({LEDGER_RELEASE_SHA256:randomBytes(32).toString('hex')});isolated.LEDGER_RELEASE_READY_SHA256=isolated.LEDGER_RELEASE_SHA256;
 const {command}=connection.connect({env:isolated,request:()=>{throw Error('REST forbidden')}});
 await command(['SET','doko:dev:test:binding','native']);assert.equal(await command(['GET','doko:dev:test:binding']),'native');
 // Unref sockets for this local connection after testing; process shutdown owns cleanup.
 require('../api/_valkey').close();
});

test('Aiven valkeys URI keeps TLS and certificate verification without opening a connection on import',async()=>{
 let options;
 const backend=createValkey(env({REDIS_URL:'valkeys://user:encoded%40password@example.invalid:1234'}),{createClient:o=>{options=o;return {isOpen:false,on(){},async connect(){this.isOpen=true},async sendCommand(){return 'OK'},destroy(){}}}});
 assert.equal(options,undefined);assert.equal(await backend.command(['GET','key']),'OK');assert.equal(new URL(options.url).protocol,'rediss:');assert.equal(new URL(options.url).password,'encoded%40password');assert.equal(options.socket.tls,true);backend.close();
 assert.throws(()=>createValkey(env({REDIS_URL:'valkey://example.invalid:1234'})),/TLS/);
});

test('real local TLS accepts the trusted CA and rejects an untrusted certificate', {skip:!process.env.REDIS_TEST_CLI},async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),tls=require('node:tls'),net=require('node:net');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'doko-valkey-tls-')),key=path.join(directory,'key.pem'),cert=path.join(directory,'cert.pem');
 const sockets=new Set();let server,backend,untrusted;
 try{
  require('node:child_process').execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1'],{stdio:'ignore',timeout:10000});
  server=tls.createServer({key:fs.readFileSync(key),cert:fs.readFileSync(cert)},socket=>{const upstream=net.createConnection({host:'127.0.0.1',port:16379});sockets.add(upstream);upstream.on('close',()=>sockets.delete(upstream));upstream.on('error',()=>socket.destroy());socket.on('error',()=>{});socket.on('close',()=>upstream.destroy());socket.pipe(upstream).pipe(socket)});
  server.on('connection',socket=>{sockets.add(socket);socket.on('close',()=>sockets.delete(socket))});server.on('tlsClientError',()=>{});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url='valkeys://127.0.0.1:'+server.address().port;
  backend=createValkey(env({REDIS_URL:url,REDIS_CA_CERT:fs.readFileSync(cert,'utf8')}));
  const k='doko:dev:tls:'+randomBytes(12).toString('hex');assert.equal(await backend.command(['SET',k,'日本語','NX','PX','60000']),'OK');assert.equal(await backend.command(['GET',k]),'日本語');assert.equal(await backend.command(['EVAL','return cjson.decode(ARGV[1]).value','0','{"value":42}']),42);
  untrusted=createValkey(env({REDIS_URL:url}));await assert.rejects(untrusted.command(['GET',k]),/connection unavailable/);
 }finally{backend?.close();untrusted?.close();for(const socket of sockets)socket.destroy();if(server)await new Promise(resolve=>server.close(resolve));fs.rmSync(directory,{recursive:true,force:true})}
});
