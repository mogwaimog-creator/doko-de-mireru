'use strict';
// Candidate server HTML endpoint. Disabled in production; no route/config change here.
const fs=require('node:fs'),path=require('node:path');
const {metadataUrl,readWork}=require('./_recovery-fixed-work');
const recovery=require('./_recovery-fetch-cache');
const {createSeoRecord}=require('../prototype/seo-ledger');
const {renderDetailHtml}=require('../prototype/seo-detail-renderer');
function enabled(){return process.env.DEV_DETAIL_HTML_ENABLED==='1'&&recovery.enabled()}
function createHandler({active=enabled,template=()=>fs.readFileSync(path.join(__dirname,'../detail.html'),'utf8'),readFixed=readWork,cacheCommand=recovery.devCommand,project=readFixed===readWork?require('./_recovery-initial-seo').projectSeo:null,fetchMetadata=fetch,clock=Date.now}={}){
 return async function detailPage(req,res){
  res.setHeader('Content-Type','text/html; charset=utf-8');res.setHeader('Cache-Control','private, no-store');
  if(!active())return res.status(404).end('Not found');
  if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).end('Method not allowed')}
  const type=req.query?.type||'movie',idText=String(req.query?.id||'');
  if(!['movie','tv'].includes(type)||! /^[1-9][0-9]*$/.test(idText)||!Number.isSafeInteger(Number(idText))){res.setHeader('X-Robots-Tag','noindex');return res.status(400).end('Invalid work identity')}
  const id=Number(idText);
  try{
   const apiKey=process.env.TMDB_API_KEY,url=metadataUrl(type,id,apiKey);
   const projected=project?await project(type,id,{command:cacheCommand,clock}):null;
   const work=await readFixed(type,id,{load:async()=>{
    if(!apiKey)throw Error('metadata unavailable');const response=await fetchMetadata(url,{signal:AbortSignal.timeout(6500),headers:{Accept:'application/json'}});
    if(!response.ok){const error=Error('metadata unavailable');error.httpStatus=response.status===404?404:503;throw error}return response.json();
   }});
   if(!projected&&(typeof (work.title||work.name)!=='string'||!(work.title||work.name).trim()))throw Error('invalid work title');
   const record=projected||createSeoRecord({type,id,title:work.title||work.name,releaseDate:work.release_date||work.first_air_date,posterPath:work.poster_path,overview:work.overview,shortIntro:work.shortIntro},{updatedAt:new Date(clock()).toISOString()});
   const html=renderDetailHtml(template(),record,{overview:work.overview||work.shortIntro||''});
   return res.status(200).end(req.method==='HEAD'?'':html);
  }catch(error){res.setHeader('X-Robots-Tag','noindex');if(error.httpStatus===404)return res.status(404).end('作品情報が見つかりません。');res.setHeader('Retry-After','5');return res.status(503).end('作品情報を読み込めません。時間をおいて再度お試しください。')}
 };
}
const legacyHandler=createHandler();module.exports=async(req,res)=>{if(process.env.LEDGER_RELEASE_MODE!==undefined&&await require('./_release-dispatch').dispatch('detail-page',req,res))return;if(!enabled()){res.setHeader('Content-Type','text/html; charset=utf-8');return res.status(200).end(req.method==='HEAD'?'':fs.readFileSync(path.join(__dirname,'../detail.html'),'utf8'))}return legacyHandler(req,res)};module.exports.createHandler=createHandler;module.exports.enabled=enabled;
