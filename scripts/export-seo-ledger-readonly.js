'use strict';
// Explicit-ID, read-only export. Run locally with existing Upstash credentials.
// No SCAN, KEYS, SET, TMDB requests, or writes. Never log credentials.
const fs=require('node:fs/promises');
const {getWork,identity}=require('../api/_work-ledger');
async function exportRecords(spec,read=getWork){
 if(!Array.isArray(spec)||spec.length===0||spec.length>20)throw Error('Specify 1-20 movie/tv IDs');
 const seen=new Set(),records=[];
 for(const item of spec){
  const {type,id}=identity(item.type,item.id);
  const key=type+':'+id;
  if(seen.has(key))throw Error('Duplicate ID: '+key);
  seen.add(key);
  const record=await read(type,id);
  if(!record)throw Error('Ledger record missing: '+key);
  if(record.type!==type||Number(record.id)!==id)throw Error('Ledger identity mismatch: '+key);
  if(record.schemaVersion!==1||typeof record.title!=='string'||!record.title.trim())throw Error('Incomplete ledger metadata: '+key);
  // Public fixed metadata only. Keep provider data, raw TMDB snapshots and notes private.
  const fields=['schemaVersion','type','id','title','originalTitle','releaseDate','overview','runtimeMinutes','genres','posterPath','backdropPath','directors','cast','collectionId','collectionName','seasons','status','voteAverage','voteCount'];
  records.push(Object.fromEntries(fields.map(field=>[field,record[field]??null])));
 }
 return records;
}
if(require.main===module){
 (async()=>{
  const [, ,input,output]=process.argv;
  if(!input||!output)throw Error('Usage: node scripts/export-seo-ledger-readonly.js ids.json export.json');
  const spec=JSON.parse(await fs.readFile(input,'utf8'));
  const records=await exportRecords(spec);
  await fs.writeFile(output,JSON.stringify(records,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Exported '+records.length+' fixed-metadata records (no provider data).');
 })().catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={exportRecords};
