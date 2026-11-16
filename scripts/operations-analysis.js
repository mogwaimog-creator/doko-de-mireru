'use strict';
// Offline by default. --live-readonly is reserved for a separately approved run.
const fs=require('node:fs');
const {checkServerIdentity}=require('node:tls');
const {collect}=require('./lib/operations-analysis');
function readJson(path) { if(fs.statSync(path).size>4*1024*1024)throw Error('Input size'); return JSON.parse(fs.readFileSync(path,'utf8')); }
async function main() {
  const args=process.argv.slice(2);
  if(args[0]==='--offline'&&args.length===2) {
    const input=readJson(args[1]); let i=0;
    const report=await collect({...input.config,baseline:input.baseline,clock:()=>Date.parse(input.at),command:async command=>{const row=input.replies[i++];if(!row||JSON.stringify(row.command)!==JSON.stringify(command))throw Error('Fixture mismatch'); if(row.error)throw Error('Fixture error'); return row.reply;}});
    if(i!==input.replies.length)throw Error('Unused fixture replies');
    console.log(JSON.stringify(report,null,2));return;
  }
  if(args.length!==1||args[0]!=='--live-readonly')throw Error('Usage');
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||process.env.NODE_DEBUG||process.env.DEBUG)throw Error('Debug override');
  const {prompt}=require('./aiven-connection-check');
  if(await prompt('Separately approved read-only run? Type APPROVED-READONLY: ')!=='APPROVED-READONLY')throw Error('Not approved');
  const host=(await prompt('Aiven hostname (no URL): ')).trim();
  if(!/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.aivencloud\.com$/.test(host)||host.length>253)throw Error('Host');
  const port=Number(await prompt('TLS port: '));if(!Number.isInteger(port)||port<1||port>65535)throw Error('Port');
  const username=await prompt('Read-only username: '),db=Number(await prompt('Reviewed DB index: '));
  const prefix=(await prompt('Reviewed physical release prefix: ')).trim();
  if(!Number.isInteger(db)||db<0||db>1023||!/^doko:ledger:release:[a-f0-9]{16}:$/.test(prefix))throw Error('Scope');
  const scan=await prompt('Optional bounded census (8 SCAN max). Type SCAN8 or Enter: ')==='SCAN8';
  const caPath=(await prompt('CA path, or Enter for system trust: ')).trim();
  const baselinePath=(await prompt('Reviewed sanitized baseline JSON path, or Enter: ')).trim();
  const baseline=baselinePath?readJson(baselinePath):null;
  let password=await prompt('Password (hidden): ',{hidden:true}),client,timer;
  try {
    client=require('redis').createClient({username,password,RESP:2,disableClientInfo:true,disableOfflineQueue:true,commandsQueueMaxLength:1,socket:{host,port,tls:true,rejectUnauthorized:true,servername:host,checkServerIdentity:(_name,cert)=>checkServerIdentity(host,cert),connectTimeout:2000,reconnectStrategy:false,...(caPath?{ca:fs.readFileSync(caPath)}:{})}});
    client.on('error',()=>{});
    await Promise.race([client.connect(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Connect deadline')),2000);})]).finally(()=>clearTimeout(timer));
    const report=await collect({prefix,db,scan,baseline,command:args=>client.sendCommand(args,{abortSignal:AbortSignal.timeout(1900)})});
    console.log(JSON.stringify(report,null,2));
  } finally {clearTimeout(timer);password=undefined;if(client?.isOpen)client.destroy();}
}
if(require.main===module)main().catch(()=>{console.error('FAIL: analysis stopped; details suppressed. No automatic retry or fallback.');process.exitCode=1;});
module.exports={readJson};
