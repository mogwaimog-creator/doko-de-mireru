'use strict';
// Explicit, local, read-only export of work metadata for offline SEO validation.
// Run only in a trusted environment with existing Upstash credentials.
// Usage: node scripts/export-work-ledger-readonly.js output.json [ids.json]
// Display capture: output.json --display-from existing-private-export.json
// Redis commands: SCAN and GET only. Never modifies production data.
const fs=require('node:fs/promises');
const path=require('node:path');
const {command}=require('../api/_redis');
const {identity}=require('../api/_work-ledger');
const PREFIX='doko:work:v1:';
async function exportLedger(run=command,spec=null){
 let keys=null;
 if(spec!==null){
  if(!Array.isArray(spec)||!spec.length||spec.length>20)throw Error('Specify 1-20 movie/tv IDs');
  keys=spec.map(item=>{const {type,id}=identity(item.type,item.id);return PREFIX+type+':'+id;});
  if(new Set(keys).size!==keys.length)throw Error('Duplicate export ID');
 }
 const seen=new Set(), records=[], problems=[];
 let cursor='0',passes=0;
 do{
  if(++passes>10000)throw Error('SCAN pass limit exceeded');
  // An explicit pilot list performs only its GETs, without scanning the database.
  const result=keys?['0',keys]:await run(['SCAN',cursor,'MATCH',PREFIX+'*','COUNT','100']);
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
const PUBLIC_DETAIL_FIELDS=['id','title','name','original_title','original_name','release_date','first_air_date','overview','runtime','episode_run_time','genres','genre_ids','poster_path','backdrop_path','vote_average','vote_count','popularity','original_language','credits','belongs_to_collection','created_by','number_of_seasons','number_of_episodes','status','seasons'];
async function exportDisplayInputs(source,run=command){
 const movie=source?.records?.find(r=>r.schemaVersion===1&&r.type==='movie'&&r.id===157336);
 if(!movie?.extensions?.tmdbDetail)throw Error('Saved movie:157336 detail is missing from the local export');
 // One bounded scan only; never loop over the database for a display check.
 const scan=await run(['SCAN','0','MATCH',PREFIX+'tv:*','COUNT','1000']);
 if(!Array.isArray(scan)||scan.length!==2||!Array.isArray(scan[1]))throw Error('Unexpected SCAN response');
 const ids=[...new Set(scan[1].filter(k=>typeof k==='string'&&/^doko:work:v1:tv:[1-9]\d*$/.test(k)))].slice(0,3)
  .map(key=>({type:'tv',id:Number(key.split(':').pop())}));
 if(!ids.length)throw Error('No TV keys in this scan page; cursor='+String(scan[0]));
 const exported=await exportLedger(run,ids);
 const candidates=exported.records.filter(r=>r.schemaVersion===1&&r.extensions?.tmdbDetail);
 const tv=candidates.find(r=>!r.genres?.some(g=>Number(g.id)===16))||candidates[0];
 if(!tv)throw Error('No usable saved TV detail in the bounded sample');
 const works=[];
 for(const r of [movie,tv]){
  const detail=r.extensions.tmdbDetail;
  if(detail.id!==r.id)throw Error('Saved detail identity mismatch');
  const raw=await run(['GET','doko:detail-providers:v1:'+r.type+':'+r.id]);
  const cache=typeof raw==='string'?JSON.parse(raw):raw;
  const results=cache?.data?.results;
  const providers=results&&typeof results==='object'&&!Array.isArray(results)
   ?{results:results.JP?{JP:results.JP}:{}}:null;
  works.push({type:r.type,id:r.id,
   seo:{title:r.title,overview:r.overview,posterPath:r.posterPath},
   snapshot:Object.fromEntries(PUBLIC_DETAIL_FIELDS.filter(k=>Object.hasOwn(detail,k)).map(k=>[k,detail[k]])),
   providers,providerCheckedAt:cache?.checkedAt??null});
 }
 return {forDisplayCheckOnly:true,readOnly:true,works};
}
async function main(output,ids,sourceFile){
 if(!output)throw Error('Usage: node scripts/export-work-ledger-readonly.js output.json [ids.json]');
 if(ids==='--display-from'){
  if(!sourceFile)throw Error('Provide the existing private export after --display-from');
  const source=JSON.parse(await fs.readFile(sourceFile,'utf8'));
  const result=await exportDisplayInputs(source);
  const dest=path.resolve(output);
  await fs.writeFile(dest,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({output:dest,readOnly:true,works:result.works.map(w=>({type:w.type,id:w.id,title:w.seo.title,providerCacheFound:!!w.providers}))}));
  return;
 }
 const spec=ids?JSON.parse(await fs.readFile(ids,'utf8')):null;
 const result=await exportLedger(command,spec);
 // Private ledger contents stay on the local machine; never upload to CI/artifacts.
 const dest=path.resolve(output);
 await fs.writeFile(dest,JSON.stringify(result,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({output:dest,scannedKeys:result.scannedKeys,exported:result.records.length,problems:result.problems.length,readOnly:true}));
}
if(require.main===module)main(...process.argv.slice(2)).catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={exportLedger,exportDisplayInputs};
