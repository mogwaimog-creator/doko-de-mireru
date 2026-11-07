'use strict';
// Offline regression runner for the season ledger; no live network/Redis.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const tests=[
 'season-fetch-coalescer.test.js',
 'season-frozen-miss-load.test.js',
 'season-stale-refresh.test.js',
 'season-refresh-policy-boundaries.test.js',
 'season-refresh-writer.test.js',
 'season-refresh-integration.test.js',
 'season-record-schema-compatibility.test.js',
 'season-storage-compaction.test.js',
 'season-api-refresh-integration.test.js',
 'season-refresh-safety-edge.test.js',
 'season-detail-renderer-contract.test.js',
 'season-refresh-opt-in.test.js',
 'search-routing-static-regression.test.js',
 'search-handler-offline-behavior.test.js'
];
let failures=0;
for(const file of tests){
 const result=spawnSync(process.execPath,[path.join(__dirname,file)],{
  encoding:'utf8',env:{...process.env,LEDGER_WRITES_RESUME:''}});
 process.stdout.write('['+file+']\n'+(result.stdout||''));
 if(result.stderr)process.stderr.write(result.stderr);
 if(result.status!==0){failures++;process.stderr.write('FAILED: '+file+'\n');}
}
if(failures){console.error('Season regression suite failed: '+failures);process.exitCode=1;}
else console.log('season regression suite passed: '+tests.length+' tests');
