'use strict';
// Explicit, local, read-only export of work metadata for offline SEO validation.
// Run only in a trusted environment with existing Upstash credentials.
// Usage: node scripts/export-work-ledger-readonly.js output.json
// Redis commands: SCAN and GET only. Never modifies production data.
const fs=require('node:fs/promises');
const path=require('node:path');
const {command}=require('../api/_redis');
const PREFIX='doko:work:v1:';
async function exportLedger(run=command){
 const seen=new Set(), records=[], problems=[];
 let cursor='0',passes=0;
 do{
  if(++passes>10000)throw Error('SCAN pass limit exceeded');
  const result=await run(['SCAN',cursor,'MATCH',PREFIX+'*','COUNT','100']);
  if(!Array.isArray(result)||result.length!==2||!Array.isArray(result[1]))throw Error('Unexpected SCAN response');
  cursor=String(result[0]);
  for(const key of result[1]){
   if(typeof key!=='string'||!/^doko:work:v1:(movie|tv):[1-9]\d*$/.test(key)||seen.has(key))continue;
   seen.add(key);
   const raw=await run(['GET',key]);
   if(raw===null||raw===undefined){problems.push({key,code:'DISAPPEARED_DURING_EXPORT'});continue;}
   try{
    const record=typeof raw==='string'?JSON.parse(raw):raw;
    if(!record||typeof record!=='object'||Array.isArray(record)){problems.push({key,code:'INVALID_RECORD'});continue;}
    const expected=PREFIX+record.type+':'+record.id;
    if(expected!==key){problems.push({key,code:'KEY_IDENTITY_MISMATCH'});continue;}
    records.push(record);
   }catch{problems.push({key,code:'INVALID_JSON'});}
  }
 }while(cursor!=='0');
 return {records,problems,scannedKeys:seen.size,readOnly:true,consistentSnapshot:false};
}
async function main(output){
 if(!output)throw Error('Usage: node scripts/export-work-ledger-readonly.js output.json');
 const result=await exportLedger();
 // Private ledger contents stay on the local machine; never upload to CI/artifacts.
 const dest=path.resolve(output);
 await fs.writeFile(dest,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({output:dest,scannedKeys:result.scannedKeys,exported:result.records.length,problems:result.problems.length,readOnly:true}));
}
if(require.main===module)main(process.argv[2]).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={exportLedger};
