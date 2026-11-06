'use strict';
// Offline: audit and select reviewed works before static HTML generation.
// Usage: node scripts/build-seo-from-ledger-export.js export.json output-dir
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {audit}=require('./audit-work-ledger-export');
const {select}=require('./select-seo-verified-works');
const {build}=require('./build-seo-static');
async function buildFromExport(input,output){
 const source=JSON.parse(await fs.readFile(input,'utf8'));
 const inspection=audit(source);
 const selected=select(source);
 if(selected.blocked)throw Error('Ledger export incomplete: '+selected.blocked);
 if(!selected.approved.length)throw Error('No explicitly verified works eligible for SEO generation');
 const temp=await fs.mkdtemp(path.join(os.tmpdir(),'doko-seo-ledger-'));
 try{
  const approved=path.join(temp,'approved.json');
  await fs.writeFile(approved,JSON.stringify(selected.approved));
  // Existing generator validates and prepares every page before writing output.
  const pages=await build(approved,output);
  return {pages,skipped:selected.skipped,inspectionIssues:inspection.issueCount};
 }finally{await fs.rm(temp,{recursive:true,force:true});}
}
if(require.main===module){
 const [input,output]=process.argv.slice(2);
 if(!input||!output){console.error('Usage: node scripts/build-seo-from-ledger-export.js export.json output-dir');process.exitCode=2;}
 else buildFromExport(input,output).then(r=>console.log(JSON.stringify({generated:r.pages.length,skipped:r.skipped.length,inspectionIssues:r.inspectionIssues})),e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={buildFromExport};
