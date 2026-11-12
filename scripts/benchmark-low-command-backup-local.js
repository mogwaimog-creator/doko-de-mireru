'use strict';
// Local-only synthetic full-size rehearsal. Never connects to a hosted Redis.
const fs=require('node:fs'),{createHash}=require('node:crypto');
const client=require('./lib/local-binary-redis'),{transport,snapshot,proofFromLocal,restoreVerified}=require('./lib/redis-low-command-backup');
async function main(){
 if(process.env.NODE_ENV==='production')throw Error('development only');
 const count=16470,nonce=process.pid+':'+Date.now(),source='doko:dev:low-benchmark:'+nonce+':',started=Date.now();
 for(let i=0;i<count;i+=128){const args=['MSET'];for(let j=i;j<Math.min(i+128,count);j++)args.push(source+j,JSON.stringify({id:j,title:'隔離試験作品',manual:'保存する手動文章',locked:true}));await client.command(args)}
 const phases={},timed=async(name,fn)=>{const at=Date.now(),result=await fn();phases[name]=Date.now()-at;return result};
 const read=transport(client),artifact=await timed('backupMs',()=>snapshot(read,{writersStopped:true,pattern:source+'*',scanCount:1000}));
 const file='/tmp/doko-low-backup-'+nonce.replaceAll(':','-')+'.json',encoded=JSON.stringify(artifact);fs.writeFileSync(file,encoded,{flag:'wx',mode:0o600});const reopened=JSON.parse(fs.readFileSync(file,'utf8'));
 const local=transport(client),proof=await timed('localProofMs',()=>proofFromLocal(local,reopened,{prefix:'doko:dev:restore:proof:'+nonce+':'}));
 const write=transport(client),restored=await timed('fullRestoreMs',()=>restoreVerified(write,reopened,proof,{prefix:'doko:dev:restore:verified:'+nonce+':'}));
 if(!restored.complete||restored.verified!==count)throw Error('incomplete rehearsal');
 console.log(JSON.stringify({kind:'synthetic loopback Redis; not production data or user PC',keys:count,sourcePattern:source+'*',archiveFile:file,archiveBytes:Buffer.byteLength(encoded),archiveFileSha256:createHash('sha256').update(encoded).digest('hex'),rawKeyAndDumpBytes:artifact.rawBytes,backup:read.stats,localProof:local.stats,fullRestore:write.stats,result:restored,phases,totalMs:Date.now()-started,scanCommandsTotal:read.stats.commands-2*count-1,productionReady:false,notes:['No source or existing keys deleted. Test source and verified permanent keys remain local.','Local argumentBytes omit RESP/HTTP overhead; response bytes and production compression are not measured.','Archive includes all matching fixture keys; production requires wildcard scope and separate Functions/config inventory.']},null,2));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
