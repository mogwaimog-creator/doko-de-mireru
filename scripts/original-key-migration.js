'use strict';
// Interactive Windows/WSL runner. No credential arguments, env secrets or application imports.
const fs=require('node:fs');
const {prompt}=require('./aiven-connection-check');
const {open}=require('./lib/migration-target-transport');
const core=require('./lib/original-key-migration');
function read(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>512*1024*1024)throw Error('INPUT_BOUND');return JSON.parse(fs.readFileSync(file,'utf8'))}
async function hashFile(file){const h=require('node:crypto').createHash('sha256');let bytes=0;const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>1024*1024*1024)throw Error('RDB_BOUND');for await(const chunk of fs.createReadStream(file)){bytes+=chunk.length;if(bytes>1024*1024*1024)throw Error('RDB_BOUND');h.update(chunk)}if(bytes!==stat.size)throw Error('RDB_CHANGED');return h.digest('hex')}
async function ask(label){return (await prompt(label)).trim().replace(/^"(.*)"$/,'$1')}
function journalFile(file){const fd=fs.openSync(file,'wx',0o600);return {async append(event){fs.writeSync(fd,JSON.stringify(event)+'\n');fs.fsyncSync(fd)},close(){fs.closeSync(fd)}}}
async function main(){
 if(process.argv.length!==2||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||process.env.NODE_DEBUG||process.env.DEBUG)throw Error('DIAGNOSTIC_CONFIG');
 const mode=await ask('Mode (capture / rehearse / restore / verify): ');
 if(!['capture','rehearse','restore','verify'].includes(mode))throw Error('MODE');
 let bundle,report,source,release;
 if(mode==='capture'){
  source=await hashFile(await ask('Original private RDB file path (used for SHA256, not a remote URI): '));release=await ask('Active release SHA256 (64 hex): ');
  if(!/^[a-f0-9]{64}$/.test(source)||!/^[a-f0-9]{64}$/.test(release))throw Error('HASH');
 }else{bundle=read(await ask('Verified private bundle JSON path: '));core.validateBundle(bundle);}
 if(mode==='restore')report=read(await ask('Successful local rehearsal report JSON path: '));
 let local=mode==='capture'||mode==='rehearse';
 if(mode==='verify')local=(await ask('Verify local Unix socket or Aiven TLS? (local / aiven): '))==='local';
 let config;
 if(local)config={socketPath:await ask('Private LOCAL Unix socket absolute path: ')};
 else{
  const host=await ask('Aiven host (no URI): '),port=Number(await ask('TLS port: ')),username=await ask('Username: '),caPath=await ask('CA PEM path (Enter for system trust): ');
  config={host,port,username,ca:caPath?fs.readFileSync(caPath):undefined};
 }
 const output=await ask('NEW private result JSON path (must not exist): ');
 // Reserve output before connection/write; a crash leaves an explicit incomplete result.
 const out=fs.openSync(output,'wx',0o600);fs.writeSync(out,'{"status":"INCOMPLETE"}\n');fs.fsyncSync(out);
 let target,journal,password;const controller=new AbortController();const interrupted=()=>{controller.abort();target?.close()};
 process.once('SIGINT',interrupted);process.once('SIGTERM',interrupted);
 try{
  if(mode==='capture'&&await ask('Type LOCAL FROZEN COMPLETE to attest full RDB export and no local writers: ')!=='LOCAL FROZEN COMPLETE')throw Error('ATTESTATION');
  if(mode==='restore'||mode==='rehearse'){
   const confirmation=mode==='restore'?'RESTORE '+bundle.sha256+' '+config.host:'LOCAL RESTORE '+bundle.sha256;
   if(await ask('No writers; EMPTY dedicated target. Type '+confirmation+': ')!==confirmation)throw Error('ATTESTATION');
   journal=journalFile(await ask('NEW private journal path (must not exist): '));
   await journal.append({phase:'reserved',bundleSha256:bundle.sha256,mode});
  }
  if(!local){password=await prompt('Password (hidden): ',{hidden:true});config.password=password;}
  target=await open({...config,allowRestore:mode==='restore'||mode==='rehearse'});password=undefined;config.password=undefined;
  const send=core.transport(target,{maxCommands:5000000,maxArgumentBytes:4*1024*1024*1024});
  let result;
  if(mode==='capture')result=await core.capture(send,{rdbSha256:source,releaseSha256:release,writersStopped:true,exportComplete:true});
  else if(mode==='verify')result=await core.verify(send,bundle);
  else result=await core.restore(send,bundle,{writersStopped:true,localRehearsal:mode==='rehearse',rehearsal:report,journal:e=>journal.append(e),signal:controller.signal});
  fs.ftruncateSync(out,0);fs.writeSync(out,JSON.stringify(result)+'\n',0,'utf8');fs.fsyncSync(out);
  console.log(JSON.stringify({status:'PASS',mode,bundleSha256:mode==='capture'?result.sha256:bundle.sha256,...(mode==='capture'?{databases:result.databases.length}:{}),notice:'Private full result saved. No automatic resume.'}));
 }finally{password=undefined;if(config)config.password=undefined;target?.close();journal?.close();fs.closeSync(out);process.removeListener('SIGINT',interrupted);process.removeListener('SIGTERM',interrupted)}
}
if(require.main===module)main().catch(()=>{console.error('FAIL: operation stopped. Target may be incomplete; last write may be unknown. Do not retry/resume/delete. Inspect private result and journal; no server details printed.');process.exitCode=1});
module.exports={read,journalFile,hashFile};
