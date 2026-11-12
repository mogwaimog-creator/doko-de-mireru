'use strict';
// Development rehearsal only. This CLI cannot connect to a remote server.
const fs=require('node:fs'),{command}=require('./lib/local-binary-redis'),{backup,restoreIsolated}=require('./lib/redis-full-backup');
async function main(){const [operation,file,scope]=process.argv.slice(2);if(!file||!['backup','restore'].includes(operation))throw Error('usage: node scripts/redis-backup-local.js backup|restore FILE DEV_PATTERN_OR_NEW_PREFIX');
 if(operation==='backup'){if(!/^doko:dev:[a-z0-9:-]+:\*$/.test(scope||''))throw Error('explicit development-only pattern required');const artifact=await backup(command,{writersStopped:true,pattern:scope});fs.writeFileSync(file,JSON.stringify(artifact)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({file,count:artifact.bundle.count,sha256:artifact.sha256,bytes:fs.statSync(file).size,notice:'local rehearsal only; not a user-PC production backup'}))}
 else{const artifact=JSON.parse(fs.readFileSync(file,'utf8'));console.log(JSON.stringify(await restoreIsolated(command,{...artifact,prefix:scope})))}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
