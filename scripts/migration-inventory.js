'use strict';
// Reads local private artifacts only. No service client, credentials or network.
const fs=require('node:fs');
const {inventory}=require('./lib/migration-inventory');
function read(file){if(fs.statSync(file).size>512*1024*1024)throw Error('artifact too large');return JSON.parse(fs.readFileSync(file,'utf8'))}
try{
 const [archiveFile,proofFile,releaseSha256,outputFile]=process.argv.slice(2);
 if(!outputFile)throw Error('usage: node scripts/migration-inventory.js ARCHIVE PROOF ACTIVE_RELEASE_SHA256 NEW_PRIVATE_OUTPUT');
 const result=inventory(read(archiveFile),read(proofFile),{activeReleaseSha256:releaseSha256});
 fs.writeFileSync(outputFile,JSON.stringify(result)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({count:result.count,families:result.families,types:result.types,warnings:result.warnings,productionReady:result.productionReady,sha256:result.sha256}));
}catch{console.error('Offline inventory failed: check local artifacts, release SHA and unused output path.');process.exitCode=1}
