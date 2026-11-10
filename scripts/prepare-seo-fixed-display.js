'use strict';
// Offline adapter: consume the existing /api/search normalized detail response.
// No network, Redis, TMDB, environment variables, or production routing.
// Input: [{type:"movie"|"tv",id:123,detail:{...existing API response...}}]
const fs=require('node:fs/promises');
const path=require('node:path');
const {normalizeFixedDisplayRecord}=require('./seo-normalized-fixed-display');
function convert(rows){
 if(!Array.isArray(rows)||rows.length>5000)throw Error('Expected bounded detail response array');
 const seen=new Set();
 return rows.map(row=>{
  if(!row||!['movie','tv'].includes(row.type))throw Error('Invalid detail type');
  const key=row.type+':'+row.id;
  if(seen.has(key))throw Error('Duplicate detail identity');
  seen.add(key);
  return normalizeFixedDisplayRecord(row.type,row.id,row.detail);
 });
}
async function main(input,output){
 const rows=JSON.parse(await fs.readFile(input,'utf8'));
 const converted=convert(rows); // Validate all before writing any output.
 await fs.mkdir(path.dirname(output),{recursive:true});
 const temporary=output+'.tmp';
 await fs.writeFile(temporary,JSON.stringify(converted,null,2)+'\n','utf8');
 await fs.rename(temporary,output);
 console.log('Prepared '+converted.length+' normalized fixed display records offline');
}
if(require.main===module){
 const [, ,input,output]=process.argv;
 if(!input||!output){console.error('Usage: node scripts/prepare-seo-fixed-display.js normalized-details.json output.json');process.exitCode=2;}
 else main(input,output).catch(error=>{console.error(error.message);process.exitCode=1;});
}
module.exports={convert,main};
