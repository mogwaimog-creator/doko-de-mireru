'use strict';
// A small number of measured LOCAL stages, never an unbounded harvest or remote write.
const {spawnSync}=require('node:child_process'),path=require('node:path'),fs=require('node:fs');
function main(args=process.argv.slice(2)){const opt=k=>args[args.indexOf(k)+1],dir=opt('--out'),batches=Number(opt('--batches')||1);if(!args.includes('--out')||!args.includes('--execute')||!Number.isSafeInteger(batches)||batches<1||batches>4)throw Error('--execute --out private-dir --batches 1..4 required');
 const run=(file,extra)=>{const child=spawnSync(process.execPath,[path.join(__dirname,file),'--out',dir,'--execute',...extra],{env:{...process.env,NODE_USE_ENV_PROXY:'1'},encoding:'utf8',timeout:120000,maxBuffer:2*1024*1024});if(child.stdout)process.stdout.write(child.stdout);if(child.status!==0)throw Error('Stage stopped; inspect checkpoint and limits before resuming')};
 for(let i=0;i<batches;i++){const state=JSON.parse(fs.readFileSync(path.join(dir,'ledger-local.json'),'utf8')),bytes=Object.values(state.sizes).reduce((a,b)=>a+b,0),limit=bytes+16*262144+2*1024*1024<=8388608?16:8;if(state.saved.length===266)break;if(state.reservedCommands+2000>40000)throw Error('session command headroom exhausted');run('collect-staged-five-ledgers.js',['--limit',String(limit)]);run('save-staged-five-ledgers.js',['--target','local','--limit',String(limit)])}
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1}module.exports={main};
