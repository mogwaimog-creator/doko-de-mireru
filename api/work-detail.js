'use strict';
// Metadata-only access for future detail pages and new watch-order guides.
// This endpoint never fetches watch providers and does not change existing pages.
const {getWork,putWorkIfAbsent,identity}=require('./_work-ledger');
const {fromTmdb}=require('./_work-from-tmdb');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  let work;
  try{work=identity(req.query?.type,req.query?.id);}
  catch{return res.status(400).json({error:'Invalid type or ID'});}
  try{
    const cached=await getWork(work.type,work.id);
    if(cached)return res.status(200).json({work:cached,source:'ledger'});
  }catch(e){console.error('WORK LEDGER READ FAILED',e);}
  const apiKey=process.env.TMDB_API_KEY;
  if(!apiKey)return res.status(503).json({error:'Metadata service unavailable'});
  try{
    const url='https://api.themoviedb.org/3/'+work.type+'/'+work.id+'?api_key='+encodeURIComponent(apiKey)+'&language=ja-JP&append_to_response=credits';
    const response=await fetch(url,{signal:AbortSignal.timeout(7000)});
    if(!response.ok)return res.status(response.status===404?404:503).json({error:'Metadata unavailable'});
    const original=await response.json();
    if(Number(original.id)!==work.id)return res.status(502).json({error:'Metadata ID mismatch'});
    const record=fromTmdb(work.type,original);
    let saved;
    try{saved=await putWorkIfAbsent(work.type,work.id,record);}
    catch(e){console.error('WORK LEDGER WRITE FAILED',e);return res.status(503).json({error:'Metadata storage unavailable'});}
    return res.status(200).json({work:saved,source:'tmdb'});
  }catch(e){console.error('WORK DETAIL FAILED',e);return res.status(503).json({error:'Metadata unavailable'});}
};
