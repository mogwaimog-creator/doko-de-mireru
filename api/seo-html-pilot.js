'use strict';
// Opt-in preview endpoint. Does not replace detail.html/person.html routes.
// Reads existing ledgers only; never calls TMDB or refreshes metadata.
const fs=require('node:fs/promises');
const path=require('node:path');
const {getWork}=require('./_work-ledger');
const {command}=require('./_redis');
const {injectSeo}=require('./_seo-initial-html');

const CACHE='public, max-age=0, must-revalidate';
const CDN='s-maxage=300, stale-while-revalidate=600';
const PERSON_PREFIX='doko:person:v1:';
function positiveId(v){
  if(typeof v!=='string'||!/^\d{1,10}$/.test(v))return null;
  const id=Number(v);
  return Number.isSafeInteger(id)&&id>0?id:null;
}
async function loadPerson(id){
  const raw=await command(['GET',PERSON_PREFIX+id]);
  if(!raw)return null;
  const data=typeof raw==='string'?JSON.parse(raw):raw;
  if(data?.schemaVersion!==1||Number(data.person?.id)!==id)return null;
  return data.person;
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  if(req.method!=='GET')return res.status(405).end();
  // Explicitly disabled unless a deployment opts in; avoids accidental production traffic.
  if(process.env.SEO_HTML_PILOT_ENABLED!=='1')return res.status(404).end();
  const kind=req.query?.kind;
  const id=positiveId(req.query?.id);
  const type=req.query?.type;
  if(!id||!['work','person'].includes(kind)||kind==='work'&&!['movie','tv'].includes(type))
    return res.status(400).end();
  try{
    let record;
    if(kind==='work'){
      record=await getWork(type,id);
      if(!record)return res.status(404).end();
    }else{
      record=await loadPerson(id);
      if(!record)return res.status(404).end();
    }
    const file=kind==='work'?'detail.html':'person.html';
    const template=await fs.readFile(path.join(process.cwd(),file),'utf8');
    const html=injectSeo(template,kind,record);
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Cache-Control',CACHE);
    res.setHeader('Vercel-CDN-Cache-Control',CDN);
    res.setHeader('X-Robots-Tag','noindex, nofollow');
    return res.status(200).send(html);
  }catch(error){
    console.error('SEO HTML PILOT ERROR',error);
    return res.status(503).end();
  }
};
