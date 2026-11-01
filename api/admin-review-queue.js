'use strict';
// Authenticated read-only review queue. No mutations and no public indexing.
const {command}=require('./_redis');
const {identity}=require('./_work-ledger');
const INDEX='doko:work-review:index:v1';
function parse(raw){try{return typeof raw==='string'?JSON.parse(raw):raw;}catch{return null;}}
module.exports=async function adminReviewQueue(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const secret=process.env.ADMIN_STATUS_SECRET;
 if(!secret||req.headers?.authorization!=='Bearer '+secret)
   return res.status(401).json({error:'Unauthorized'});
 try{
   const start=Number(req.query?.offset??0);
   if(!Number.isSafeInteger(start)||start<0||start>100000)
     return res.status(400).json({error:'Invalid offset'});
   const limit=50;
   const keys=await command(['ZRANGE',INDEX,start,start+limit-1]);
   const values=keys?.length?await command(['MGET',...keys]):[];
   const valid=(values||[]).map(parse);
   const workKeys=valid.map(review=>{try{return review?identity(review.type,review.id).key:null;}catch{return null;}});
   const lookup=workKeys.filter(Boolean);
   const workValues=lookup.length?await command(['MGET',...lookup]):[];
   const works=new Map();let wi=0;
   for(const k of workKeys){if(k)works.set(k,parse(workValues[wi++]));}
   const records=[];
   for(let i=0;i<(keys||[]).length;i++){
     const review=valid[i];
     if(!review||!['unreviewed','reviewed','needs_recheck'].includes(review.status))continue;
     const work=works.get(workKeys[i]);
     records.push({type:review.type,id:review.id,title:work?.title||null,
       releaseYear:work?.releaseDate?.slice(0,4)||null,
       status:review.status,fingerprint:review.fingerprint||null,registeredAt:review.registeredAt,
       reviewedAt:review.reviewedAt||null,reviewedBy:review.reviewedBy||null});
   }
   const total=await command(['ZCARD',INDEX]);
   return res.status(200).json({totalIndexed:total,offset:start,pageSize:limit,
     items:records,hasMore:start+limit<total,
     note:'Total is indexed review entries, not necessarily all metadata records.'});
 }catch(error){
   console.error('admin review queue failed',error.message);
   return res.status(503).json({error:'Review queue temporarily unavailable'});
 }
};
