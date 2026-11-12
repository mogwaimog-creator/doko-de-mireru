'use strict';
// Default is offline. Never initializes, deletes or scans any data.
const fs=require('node:fs'),{probe}=require('./lib/cutover/minimal-probe');
async function main(){const execute=process.argv.includes('--execute');let options={execute};if(execute){const file=process.argv[process.argv.indexOf('--budget')+1];if(!process.argv.includes('--budget')||!file)throw Error('private --budget confirmation JSON required');options={execute,endpoint:process.env.LEDGER_RELEASE_REDIS_URL,token:process.env.LEDGER_RELEASE_REDIS_TOKEN,releaseSha256:process.env.LEDGER_RELEASE_SHA256,request:fetch,budgetConfirmation:JSON.parse(fs.readFileSync(file,'utf8'))}}console.log(JSON.stringify(await probe(options),null,2))}
main().catch(()=>{console.error('Probe stopped: credentials, fresh free-plan/headroom evidence or bounded compatibility check unavailable. No automatic retry.');process.exitCode=1});
