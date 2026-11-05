'use strict';
// Offline parity audit. No API calls: compare a captured normalized detail response
// with a prepared fixed record and its separately captured dynamic provider payload.
const fs=require('node:fs/promises');
const {splitDetailResponse,mergeDetailResponse}=require('./seo-detail-response-contract');
const {validateFixedDisplayRecord}=require('./seo-normalized-fixed-display');
const assert=require('node:assert/strict');
function auditParity(rows,records){
 if(!Array.isArray(rows)||!Array.isArray(records))throw Error('Expected arrays');
 const map=new Map();
 for(const record of records){
  const key=record.type+':'+record.id;
  if(map.has(key))throw Error('Duplicate fixed record: '+key);
  map.set(key,record);
 }
 const results=[];
 for(const row of rows){
  const key=row.type+':'+row.id;
  const record=map.get(key);
  if(!record){results.push({key,ok:false,reason:'missing fixed record'});continue;}
  try{
   const fixed=validateFixedDisplayRecord(record,row.type,row.id);
   const original=splitDetailResponse(row.detail);
   assert.deepStrictEqual(fixed,original.fixed);
   assert.deepStrictEqual(mergeDetailResponse(fixed,original.dynamic),row.detail);
   results.push({key,ok:true});
  }catch(error){results.push({key,ok:false,reason:error.message});}
 }
 return {total:results.length,passed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok)};
}
async function main(input,output){
 const [rows,records]=await Promise.all([fs.readFile(input,'utf8'),fs.readFile(output,'utf8')]);
 const result=auditParity(JSON.parse(rows),JSON.parse(records));
 console.log(JSON.stringify(result,null,2));
 if(result.failed.length)process.exitCode=1;
}
if(require.main===module){
 const [, ,input,output]=process.argv;
 if(!input||!output){console.error('Usage: node scripts/audit-seo-display-parity.js normalized-details.json prepared-fixed.json');process.exitCode=2;}
 else main(input,output).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={auditParity};
