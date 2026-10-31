// Gundam fixed-ID streaming lookup. Japanese time 06:00 / 18:00 refresh boundaries.
// No title search, no poster lookup, no parent-season provider inheritance.
const WORKS=Object.freeze({'21731':'tv','45500':'tv','196400':'tv','64375':'tv','43887':'tv','37048':'movie','21732':'tv','13674':'tv','5660':'tv','16157':'movie','88865':'tv','46512':'tv','883768':'movie','553610':'movie','685274':'movie','910850':'movie','16308':'movie','72677':'tv','25797':'tv','20111':'tv','1146972':'movie','30093':'tv','21730':'tv','25504':'tv','37546':'tv','45835':'tv','61414':'tv','60667':'tv','76821':'tv','91566':'tv','122468':'tv','22914':'tv'});
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
 res.setHeader('Vercel-CDN-Cache-Control','s-maxage='+ttl);
 try{
  const url='https://api.themoviedb.org/3/'+WORKS[id]+'/'+id+'?api_key='+encodeURIComponent(apiKey)+'&append_to_response=watch/providers';
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('TMDB '+response.status);
  const payload=await response.json();
  const jp=payload?.['watch/providers']?.results?.JP||{};
  const streaming=Array.isArray(jp.flatrate)?jp.flatrate.map(x=>({
   provider_id:x.provider_id,provider_name:x.provider_name,logo_path:x.logo_path
  })):[];
  return res.status(200).json({id:Number(id),content_type:WORKS[id],poster_path:payload.poster_path||null,streaming,checked_at:new Date().toISOString()});
 }catch(e){
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  return res.status(502).json({error:'Streaming information unavailable'});
 }
};
