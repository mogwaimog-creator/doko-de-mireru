'use strict';
// Opt-in, bounded import of existing series works into the common metadata ledger.
// Never overwrites an existing work, and never changes published pages.
const {command}=require('./_redis');
const {identity,normalizeWork}=require('./_work-ledger');
const {fromTmdb}=require('./_work-from-tmdb');
const {registerForReview}=require('./_work-review');
const {recordError}=require('./_ops-errors');
const {inventory}=require('./admin-work-migration-preview')._test;
const BATCH=5;
async function importBatch(offset=0,{read=command,load=loadTmdb,logError=recordError}={}){
 const {works}=inventory();
 const page=works.slice(offset,offset+BATCH);
 const result={total:works.length,offset,nextOffset:offset+page.length<works.length?offset+page.length:null,imported:0,alreadyPresent:0,failed:[]};
 for(const work of page){
  const {key}=identity(work.type,work.id);
  try{
   const existing=await read(['GET',key]);
   if(existing){
    // An existing key is not necessarily a usable ledger record. Never
    // overwrite invalid data automatically; surface it for investigation.
    let parsed=null;
    try{parsed=typeof existing==='string'?JSON.parse(existing):existing;}catch{}
    if(parsed?.schemaVersion!==1||parsed?.type!==work.type||parsed?.id!==work.id||typeof parsed?.title!=='string'||!parsed.title.trim()){
     throw new Error('Existing ledger record is invalid; manual repair required');
    }
    result.alreadyPresent++;continue;
   }
   const item=await load(work);
   if(!item||Number(item.id)!==work.id)throw new Error('TMDB identity mismatch');
   const record=normalizeWork(work.type,work.id,{...fromTmdb(work.type,item),verification:{identity:'verified',metadata:'not_checked',items:{},notes:'ID confirmed in existing series inventory'}});
   // NX avoids overwriting edits made since the initial existence check.
   const saved=await read(['SET',key,JSON.stringify(record),'NX']);
   if(saved!=='OK'){result.alreadyPresent++;continue;}
   result.imported++;
   // No automatic "reviewed" claim: prior verification of IDs is not
   // evidence that all metadata fields were manually checked.
   try{await registerForReview(record,'existing-series-import');}
   catch(e){console.error('series import review registration',e.message);}
  }catch(e){
   result.failed.push({type:work.type,id:work.id,reason:e.message});
   try{await logError({area:'work',code:'SERIES_IMPORT_FAILED',type:work.type,id:work.id,message:'共通台帳への作品登録に失敗しました'});}
   catch(logError){console.error('import error journal unavailable',logError.message);}
  }
 }
 return result;
}
async function loadTmdb(work){
 const key=process.env.TMDB_API_KEY;
 if(!key)throw new Error('TMDB_API_KEY unavailable');
 const url='https://api.themoviedb.org/3/'+work.type+'/'+work.id+'?language=ja-JP&append_to_response=credits&api_key='+encodeURIComponent(key);
 const response=await fetch(url,{signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw new Error('TMDB HTTP '+response.status);
 return response.json();
}
async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const secret=process.env.ADMIN_STATUS_SECRET;
 if(!secret||req.headers.authorization!=='Bearer '+secret)return res.status(401).json({error:'Unauthorized'});
 if(process.env.WORK_LEDGER_IMPORT_ENABLED!=='1')return res.status(403).json({error:'Import disabled'});
 const offset=req.body?.offset??0;
 if(!Number.isSafeInteger(offset)||offset<0||offset>1000000)return res.status(400).json({error:'Invalid offset'});
 try{return res.status(200).json(await importBatch(offset));}
 catch(e){console.error('series import failed',e.message);return res.status(503).json({error:'Import unavailable'});}
}
module.exports=handler;
module.exports._test={importBatch,BATCH};
