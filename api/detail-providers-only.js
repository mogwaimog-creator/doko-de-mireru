'use strict';
// Isolated, opt-in provider-only pilot. No work metadata lookup.
// Not wired into detail.html; existing behavior remains unchanged.
const {getDetailProviders}=require('./_detail-providers-cache');
const {identity}=require('./_work-ledger');
function normalize(items){
  return Array.isArray(items)?items.filter(p=>p&&p.provider_name).map(p=>({
    provider_id:p.provider_id||null,
    provider_name:p.provider_name||'',
    logo_path:p.logo_path||null,
    provider_url:p.provider_url||null
  })):[];
}
function project(data,type,id){
  const jp=data?.results?.JP||{};
  return {type,id,streaming:normalize(jp.flatrate),rental:normalize(jp.rent),
    purchase:normalize(jp.buy),providerPageUrl:typeof jp.link==='string'?jp.link:null};
}
async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  if(process.env.WORK_LEDGER_ENABLED!=='1')
    return res.status(404).json({error:'Provider-only pilot disabled'});
  let work;
  try{
    if(typeof req.query?.type!=='string'||typeof req.query?.id!=='string'||!/^[1-9]\\d{0,14}$/.test(req.query.id))
      throw Error('Invalid identity');
    work=identity(req.query.type,req.query.id);
  }catch{return res.status(400).json({error:'Invalid work identity'});}
  const apiKey=process.env.TMDB_API_KEY;
  if(!apiKey)return res.status(503).json({error:'Provider service unavailable'});
  try{
    const result=await getDetailProviders(work.type,work.id,async()=>{
      const url='https://api.themoviedb.org/3/'+work.type+'/'+work.id+'/watch/providers?api_key='+encodeURIComponent(apiKey);
      const response=await fetch(url,{headers:{Accept:'application/json'}});
      if(!response.ok)throw Error('Provider upstream HTTP '+response.status);
      return response.json();
    });
    return res.status(200).json(project(result.data,work.type,work.id));
  }catch(error){
    const code=error?.code;
    if(code==='DETAIL_PROVIDERS_BUSY'||code==='DETAIL_STORAGE_UNAVAILABLE')
      return res.status(503).json({error:'Provider data temporarily unavailable',code});
    console.error('PROVIDER-ONLY PILOT ERROR',error?.message);
    return res.status(503).json({error:'Provider data temporarily unavailable'});
  }
}
module.exports=handler;
module.exports.project=project;
