'use strict';
// Metadata-only access for future detail pages and new watch-order guides.
// This endpoint never fetches watch providers and does not change existing pages.
const {getWork,putWorkIfAbsent,identity}=require('./_work-ledger');
const {fromTmdb}=require('./_work-from-tmdb');
const {firstWorkLoad}=require('./_work-first-load');
// Expose only display-safe fixed metadata. Internal review notes and cached
// TMDB payloads stay in Redis and must never be returned to visitors.
const PUBLIC_FIELDS=['schemaVersion','type','id','title','originalTitle','releaseDate','overview','runtimeMinutes','genres','posterPath','backdropPath','directors','cast','collectionId','collectionName','seasons','status','voteAverage','voteCount'];
function publicWork(record){return Object.fromEntries(PUBLIC_FIELDS.map(key=>[key,record[key]??null]));}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  // Keep the new public endpoint dormant until preview verification and explicit release.
  if(process.env.WORK_LEDGER_ENABLED!=='1')return res.status(503).json({error:'Work ledger not enabled'});
  let work;
  try{work=identity(req.query?.type,req.query?.id);}
  catch{return res.status(400).json({error:'Invalid type or ID'});}
  try{
    const cached=await getWork(work.type,work.id);
    if(cached)return res.status(200).json({work:publicWork(cached),source:'ledger'});
  }catch(e){console.error('WORK LEDGER READ FAILED',e);res.setHeader('Retry-After','5');return res.status(503).json({error:'Metadata storage temporarily unavailable',code:'WORK_STORAGE_UNAVAILABLE'});}
  const apiKey=process.env.TMDB_API_KEY;
  if(!apiKey)return res.status(503).json({error:'Metadata service unavailable'});
  try{
    const saved=await firstWorkLoad(work.type,work.id,async()=>{
      const existing=await getWork(work.type,work.id);
      if(existing)return existing;
      const url='https://api.themoviedb.org/3/'+work.type+'/'+work.id+'?api_key='+encodeURIComponent(apiKey)+'&language=ja-JP&append_to_response=credits';
      const response=await fetch(url,{signal:AbortSignal.timeout(7000)});
      if(!response.ok){
        const error=new Error('Metadata unavailable');
        error.httpStatus=response.status===404?404:503;
        throw error;
      }
      const original=await response.json();
      if(Number(original.id)!==work.id){
        const error=new Error('Metadata ID mismatch');
        error.httpStatus=502;
        throw error;
      }
      const {['watch/providers']:ignored,...fixedDetail}=original;
      const record={...fromTmdb(work.type,original),extensions:{tmdbDetail:fixedDetail}};
      return putWorkIfAbsent(work.type,work.id,record);
    });
    // firstWorkLoad waiters receive tmdbDetail; the endpoint must always
    // return the normalized ledger record, not the raw TMDB payload.
    const canonical=await getWork(work.type,work.id);
    if(!canonical)throw new Error('Work ledger missing after initial load');
    return res.status(200).json({work:publicWork(canonical),source:'ledger'});
  }catch(e){
    console.error('WORK DETAIL FAILED',e);
    if(e?.code==='WORK_METADATA_BUSY'||e?.code==='WORK_STORAGE_UNAVAILABLE'){
      res.setHeader('Retry-After','5');
      return res.status(503).json({error:'Metadata temporarily unavailable',code:e.code});
    }
    return res.status(e?.httpStatus||503).json({error:'Metadata unavailable'});
  }
};
