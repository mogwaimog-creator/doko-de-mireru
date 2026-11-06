'use strict';
// Offline-only inspection of a private Redis JSON export. NO network, Redis, or TMDB access.
// Run on a local COPY. Never upload the private backup to GitHub.
const fs=require('node:fs');
const path=require('node:path');
function main(){
 const file=process.argv[2];
 if(!file){console.error('Usage: node scripts/inspect-work-backup.js <local-backup.json>');process.exitCode=2;return;}
 const data=JSON.parse(fs.readFileSync(path.resolve(file),'utf8'));
 const result={format:'unknown',totalEntries:0,workKeys:0,validWorkKeys:0,invalidWorkKeys:0,samples:[],safeForMigration:false};
 const entries=Array.isArray(data)?data.map((v,i)=>[String(i),v]):data&&typeof data==='object'?Object.entries(data):[];
 result.format=Array.isArray(data)?'array':data&&typeof data==='object'?'object':'unsupported';
 result.totalEntries=entries.length;
 const regex=/^doko:work:v1:(movie|tv):(\d+)$/;
 for(const [key,value] of entries){
  if(!key.startsWith('doko:work:'))continue;
  result.workKeys++;
  const match=key.match(regex);
  if(!match){result.invalidWorkKeys++;continue;}
  try{
   const record=typeof value==='string'?JSON.parse(value):value;
   if(!record||record.type!==match[1]||Number(record.id)!==Number(match[2])||!record.title)throw Error('invalid');
   result.validWorkKeys++;
   if(result.samples.length<5)result.samples.push({type:match[1],id:Number(match[2])});
  }catch{result.invalidWorkKeys++;}
 }
 result.safeForMigration=result.validWorkKeys>0&&result.invalidWorkKeys===0;
 console.log(JSON.stringify(result,null,2));
 if(!result.safeForMigration)process.exitCode=1;
}
if(require.main===module)main();
