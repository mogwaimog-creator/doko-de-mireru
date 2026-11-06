'use strict';
// Offline-only selection of explicitly reviewed ledger records for SEO generation.
// Does not change verification flags, read Redis, or call TMDB.
const fs=require('node:fs/promises');
function select(records){
 const source=Array.isArray(records)?{records,problems:[]}:records;
 if(!source||!Array.isArray(source.records))throw Error('Expected ledger export records');
 const approved=[],skipped=[],counts=new Map();
 for(const r of source.records){const k='doko:work:v1:'+r?.type+':'+r?.id;counts.set(k,(counts.get(k)||0)+1);}
 const compromised=new Set((source.problems||[]).map(p=>p.key));
 for(const r of source.records){
  const key='doko:work:v1:'+r?.type+':'+r?.id;
  const reasons=[];
  if(!['movie','tv'].includes(r?.type)||!Number.isSafeInteger(r?.id)||r.id<=0)reasons.push('INVALID_IDENTITY');
  if(counts.get(key)>1)reasons.push('DUPLICATE_IDENTITY');
  if(compromised.has(key))reasons.push('EXPORT_PROBLEM');
  if(r?.schemaVersion!==1)reasons.push('INVALID_SCHEMA');
  if(r?.verification?.identity!=='verified'||r?.verification?.metadata!=='verified')reasons.push('NOT_VERIFIED');
  if(Array.isArray(r?.errors)&&r.errors.length)reasons.push('RECORDED_ERRORS');
  if(!r?.title||!r?.releaseDate||!r?.posterPath||!r?.overview)reasons.push('INCOMPLETE_FIXED_METADATA');
  if(!r?.extensions?.tmdbDetail||Number(r.extensions.tmdbDetail.id)!==r.id)reasons.push('MISSING_OR_MISMATCHED_DETAIL');
  if(reasons.length)skipped.push({key,reasons});
  else approved.push(r);
 }
 // Never publish a partial selection if the export itself had read failures.
 if((source.problems||[]).length) return {approved:[],skipped,blocked:'EXPORT_PROBLEMS',readOnly:true};
 return {approved,skipped,blocked:null,readOnly:true};
}
async function main(input,output,report){
 if(!input||!output||!report)throw Error('Usage: node scripts/select-seo-verified-works.js export.json approved.json report.json');
 const result=select(JSON.parse(await fs.readFile(input,'utf8')));
 await fs.writeFile(report,JSON.stringify({approvedCount:result.approved.length,skipped:result.skipped,blocked:result.blocked,readOnly:true},null,2)+'\n',{flag:'wx'});
 await fs.writeFile(output,JSON.stringify(result.approved,null,2)+'\n',{flag:'wx'});
 console.log('SEO candidates:',result.approved.length,'skipped:',result.skipped.length,'blocked:',result.blocked||'none');
}
if(require.main===module)main(...process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={select};
