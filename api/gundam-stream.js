// Gundam fixed-ID streaming lookup. Japanese time 06:00 / 18:00 refresh boundaries.
// No title search, no poster lookup, no parent-season provider inheritance.
const WORKS=Object.freeze({
  '21731':'tv','45500':'tv','196400':'tv','21732':'tv'
});
function secondsUntilBoundary(){
 const now=Date.now(),jst=new Date(now+9*3600000);
 const hour=jst.getUTCHours();
 jst.setUTCHours(hour<6?6:hour<18?18:30,0,0,0);
 return Math.max(1,Math.floor((jst.getTime()-9*3600000-now)/1000));
}
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const id=String(req.query?.id||'');
 if(!Object.prototype.hasOwnProperty.call(WORKS,id)){
  res.setHeader('Cache-Control','no-store');
  return res.status(400).json({error:'Unverified work ID'});
 }
 const apiKey=process.env.TMDB_API_KEY;
 if(!apiKey)return res.status(503).json({error:'Provider lookup unavailable'});
 const ttl=secondsUntilBoundary();
 res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
 res.setHeader('Vercel-CDN-Cache-Control','s-maxage='+ttl+', stale-while-revalidate=60');
 try{
  const url='https://api.themoviedb.org/3/tv/'+id+'/watch/providers?api_key='+encodeURIComponent(apiKey);
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('TMDB '+response.status);
  const payload=await response.json();
  const jp=payload?.results?.JP||{};
  const streaming=Array.isArray(jp.flatrate)?jp.flatrate.map(x=>({
   provider_id:x.provider_id,provider_name:x.provider_name,logo_path:x.logo_path
  })):[];
  return res.status(200).json({id:Number(id),content_type:'tv',streaming,checked_at:new Date().toISOString()});
 }catch(e){
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  return res.status(502).json({error:'Streaming information unavailable'});
 }
};
