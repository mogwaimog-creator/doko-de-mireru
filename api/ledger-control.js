'use strict';
// Development wiring for the future authenticated operations endpoint.
const {timingSafeEqual}=require('node:crypto');
function createHandler({ops,active=require('./_cutover-runtime-dev').enabled,token=()=>process.env.DEV_LEDGER_ADMIN_TOKEN}={}){
 return async(req,res)=>{res.setHeader('Cache-Control','private, no-store');if(!active())return res.status(404).json({error:'disabled'});
 const expected=token(),supplied=Buffer.from(String(req.headers?.authorization||'')),wanted=Buffer.from('Bearer '+expected);if(!expected||supplied.length!==wanted.length||!timingSafeEqual(supplied,wanted))return res.status(401).json({error:'unauthorized'});
 if(!ops)return res.status(503).json({error:'operations adapter unavailable'});
 try{if(req.method==='GET')return res.status(200).json(await ops.status());if(req.method!=='POST')return res.status(405).json({error:'GET or POST required'});const body=req.body||{};let result;
 if(body.action==='acquisition-policy')result=await ops.setAcquisitionPolicy(body.policy);else if(body.action==='pause')result=await ops.pause(body.reason);else if(body.action==='prepare-resume')result=await ops.prepareResume(body.keys,body.reason);else if(body.action==='resume')result=await ops.resume(body.plan,body.acknowledge===true);else return res.status(400).json({error:'unsupported operation'});return res.status(200).json(result);
 }catch{return res.status(409).json({error:'operation blocked; inspect writers, record errors and review freshness'})}
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;
