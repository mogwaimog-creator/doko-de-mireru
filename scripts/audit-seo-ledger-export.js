'use strict';
// Offline-only readiness audit for a manually supplied ledger export.
// Prints aggregate counts and error categories, never titles, IDs or record contents.
const fs=require('node:fs/promises');
const {extractFixedDetail}=require('./extract-seo-fixed-detail');
function audit(rows){
 if(!Array.isArray(rows))throw Error('Expected an array');
 const result={total:rows.length,ready:0,missingFixedDetail:0,identityMismatch:0,providerLeak:0,invalidRecord:0};
 const seen=new Set();
 for(const record of rows){
  try{
   const key=record?.type+':'+record?.id;
   if(seen.has(key)){result.invalidRecord++;continue;}
   seen.add(key);
   extractFixedDetail(record);
   result.ready++;
  }catch(e){
   if(/Missing or mismatched/.test(e.message)){
    if(record?.extensions?.tmdbDetail)result.identityMismatch++;
    else result.missingFixedDetail++;
   }else if(/Dynamic provider fields/.test(e.message))result.providerLeak++;
   else result.invalidRecord++;
  }
 }
 result.complete=result.ready===result.total;
 return result;
}
async function main(input){
 const rows=JSON.parse(await fs.readFile(input,'utf8'));
 console.log(JSON.stringify(audit(rows),null,2));
}
if(require.main===module){
 const file=process.argv[2];
 if(!file){console.error('Usage: node scripts/audit-seo-ledger-export.js export.json');process.exitCode=2;}
 else main(file).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={audit};
