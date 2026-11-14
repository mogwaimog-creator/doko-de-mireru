'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {prompt,probe}=require('../scripts/aiven-connection-check');
const config={host:'localhost',port:12345,username:'default',password:'synthetic-secret'};
const replies=['PONG',['123','456'],'redis_version:7.2.7\r\n','used_memory:123\r\nmaxmemory:456\r\n','connected_clients:1\r\n'];
test('hidden prompt never echoes, handles backspace, restores terminal and removes listeners',async()=>{
 const input=new EventEmitter();Object.assign(input,{isTTY:true,isRaw:false,setEncoding(){},setRawMode(v){this.isRaw=v},resume(){},pause(){}});
 let output='';const p=prompt('Password: ',{hidden:true,input,output:{isTTY:true,write(v){output+=v}}});
 input.emit('data','synthetic-secrex\x7ft\r');assert.equal(await p,'synthetic-secret');assert.equal(output,'Password: \n');assert.equal(input.isRaw,false);assert.equal(input.listenerCount('data'),0);
 for(const event of ['cancel','error','end']){const p=prompt('Password: ',{hidden:true,input,output:{isTTY:true,write(){}}});if(event==='cancel')input.emit('data','secret\x03');else input.emit(event,Error('secret'));await assert.rejects(p,/cancelled/);assert.equal(input.isRaw,false);assert.equal(input.listenerCount('data'),0)}
 await assert.rejects(prompt('',{input:{isTTY:false}}),/terminal/);
});
test('fixed read-only commands, strict TLS, no retry, cleanup and redacted failure',async()=>{
 for(const mode of ['success','auth','command','timeout','command-timeout','invalid']){
  let options,destroyed=0,connects=0;const sent=[];
  const client={isOpen:false,on(){},connect(){connects++;this.isOpen=true;if(mode==='auth')return Promise.reject(Error(config.password));if(mode==='timeout')return new Promise(()=>{});return Promise.resolve()},sendCommand(args){sent.push(args);if(mode==='command-timeout')return new Promise(()=>{});if(mode==='command')return Promise.reject(Error(config.password));return Promise.resolve(mode==='invalid'?'bad':replies[sent.length-1])},destroy(){destroyed++;this.isOpen=false}};
  const p=probe(config,{timeoutMs:25,createClient:o=>(options=o,client)});
  if(mode==='success'){const result=await p;assert.equal(result.status,'PASS');assert.deepEqual(sent,[['PING'],['TIME'],['INFO','server'],['INFO','memory'],['INFO','clients']]);assert(!JSON.stringify(result).includes(config.password))}else await assert.rejects(p,e=>!e.message.includes(config.password)&&/No retry/.test(e.message));
  assert.equal(connects,1);assert.equal(destroyed,1);assert.equal(options.socket.rejectUnauthorized,true);assert.equal(options.socket.reconnectStrategy,false);assert.equal(options.disableOfflineQueue,true);assert.equal(options.disableClientInfo,true);assert.equal(options.url,undefined);
 }
});
test('real authenticated local Redis through verified TLS, wrong password/CA/hostname refused and sockets closed',{skip:!process.env.REDIS_TEST_SERVER},async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),tls=require('node:tls'),net=require('node:net');
 const {spawn,execFileSync}=require('node:child_process');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiven-probe-'));
 let redis,server;const sockets=new Set();
 try{
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',path.join(dir,'key'),'-out',path.join(dir,'cert'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=DNS:localhost'],{stdio:'ignore'});
  const reserved=net.createServer();await new Promise(r=>reserved.listen(0,'127.0.0.1',r));const port=reserved.address().port;await new Promise(r=>reserved.close(r));
  redis=spawn(process.env.REDIS_TEST_SERVER,['-'],{stdio:['pipe','pipe','pipe']});
  const ready=new Promise((resolve,reject)=>{redis.stdout.on('data',b=>{if(String(b).includes('Ready to accept connections'))resolve()});redis.once('error',reject);redis.once('exit',()=>reject(Error('Redis stopped')))});
  redis.stdin.end(`bind 127.0.0.1\nport ${port}\nsave ""\nappendonly no\nrequirepass synthetic-secret\ndir ${dir}\n`);await ready;
  const key=fs.readFileSync(path.join(dir,'key')),ca=fs.readFileSync(path.join(dir,'cert'));
  server=tls.createServer({key,cert:ca},down=>{const up=net.createConnection({host:'127.0.0.1',port});sockets.add(up);up.on('close',()=>sockets.delete(up));up.on('error',()=>down.destroy());down.on('error',()=>{});down.on('close',()=>up.destroy());down.pipe(up).pipe(down)});
  server.on('connection',s=>{sockets.add(s);s.on('close',()=>sockets.delete(s))});server.on('tlsClientError',()=>{});
  await new Promise(r=>server.listen(0,'::',r));const cfg={...config,port:server.address().port,ca};
  assert.equal((await probe(cfg)).status,'PASS');
  await assert.rejects(probe({...cfg,password:'wrong-synthetic'}),/failed/);
  await assert.rejects(probe({...cfg,ca:undefined}),/failed/);
  await assert.rejects(probe({...cfg,host:'127.0.0.1'}),/failed/);
  await new Promise(r=>setTimeout(r,100));assert.equal(sockets.size,0);
 }finally{for(const s of sockets)s.destroy();if(server)await new Promise(r=>server.close(r));if(redis&&redis.exitCode===null){const exited=new Promise(r=>redis.once('exit',r));redis.kill();await exited}fs.rmSync(dir,{recursive:true,force:true})}
});
