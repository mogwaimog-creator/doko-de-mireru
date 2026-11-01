'use strict';
// Private mutation endpoint; only explicit authenticated POSTs may mark a work reviewed.
const {getWork,identity}=require('./_work-ledger');
const {markReviewed,fingerprint}=require('./_work-review');
module.exports=async function adminConfirmReview(req,res){
 res.setHeader('Cache-Control','private, no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='POST')return res.status(405).json({error:'POST only'});
 const secret=process.env.ADMIN_STATUS_SECRET;
 if(!secret||req.headers?.authorization!=='Bearer '+secret)
   return res.status(401).json({error:'Unauthorized'});
 try{
   const body=req.body;
   if(!body||typeof body!=='object'||Array.isArray(body))
     return res.status(400).json({error:'Invalid request'});
   const {type,id,expectedFingerprint}=body;
   try{identity(type,id);}catch{return res.status(400).json({error:'Invalid work identity'});}
   if(typeof expectedFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(expectedFingerprint))
     return res.status(400).json({error:'Expected fingerprint required'});
   const work=await getWork(type,id);
   if(!work)return res.status(404).json({error:'Work not found'});
   if(fingerprint(work)!==expectedFingerprint)
     return res.status(409).json({error:'Work changed since review; reload'});
   const updated=await markReviewed(work,'admin',new Date().toISOString(),expectedFingerprint);
   return res.status(200).json({type:updated.type,id:updated.id,status:updated.status,reviewedAt:updated.reviewedAt});
 }catch(error){
   if(/Metadata changed|concurrently/.test(error.message))
     return res.status(409).json({error:'Review state changed; reload'});
   if(/not registered/.test(error.message))
     return res.status(409).json({error:'Work not in review queue'});
   console.error('admin confirm review failed',error.message);
   return res.status(503).json({error:'Review confirmation temporarily unavailable'});
 }
};
