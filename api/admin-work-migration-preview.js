'use strict';
// Read-only migration preview for the existing verified series watch list.
// No TMDB calls, no Redis writes, no changes to published pages.
const {command}=require('./_redis');
const {identity}=require('./_work-ledger');
const source=require('../data/streaming-works.json');
const BATCH=25;
function inventory(entries=source){
 const unique=new Map(),duplicates=[];
 for(const entry of entries){
  const work=identity(entry.type,entry.id);
  const key=work.type+':'+work.id;
  if(unique.has(key)){duplicates.push(key);continue;}
  unique.set(key,{type:work.type,id:work.id});
 }
 return {works:[...unique.values()],duplicates};
}
async function previewPage(offset=0,read=command){
 const {works,duplicates}=inventory();
 const page=works.slice(offset,offset+BATCH);
 const keys=page.map(w=>'doko:work:v1:'+w.type+':'+w.id);
 const values=keys.length?await read(['MGET',...keys]):[];
 const items=page.map((work,i)=>{
  let parsed=null;
  try{parsed=values?.[i]?(typeof values[i]==='string'?JSON.parse(values[i]):values[i]):null;}catch{}
  const valid=parsed?.schemaVersion===1&&parsed?.type===work.type&&parsed?.id===work.id&&typeof parsed?.title==='string'&&parsed.title.length>0;
  return {...work,ledgerStatus:valid?'registered':parsed?'invalid':'not_registered',title:valid?parsed.title:null};
 });
 return {total:works.length,duplicateEntries:duplicates.length,offset,nextOffset:offset+page.length<works.length?offset+page.length:null,items};
}
async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const secret=process.env.ADMIN_STATUS_SECRET;
 if(!secret||req.headers.authorization!=='Bearer '+secret)return res.status(401).json({error:'Unauthorized'});
 const raw=req.query?.offset??'0';
 if(!/^(0|[1-9][0-9]*)$/.test(String(raw)))return res.status(400).json({error:'Invalid offset'});
 const offset=Number(raw);
 if(!Number.isSafeInteger(offset)||offset>1000000)return res.status(400).json({error:'Invalid offset'});
 try{return res.status(200).json(await previewPage(offset));}
 catch(e){console.error('work migration preview',e.message);return res.status(503).json({error:'Preview temporarily unavailable'});}
}
module.exports=handler;
module.exports._test={inventory,previewPage,BATCH};
