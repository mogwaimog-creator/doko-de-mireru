// Fixed Gundam poster metadata: allowlisted TMDB IDs, 30-day CDN cache.
// Poster metadata is separate from twice-daily streaming availability refresh.
const WORKS=Object.freeze({'21731':'tv','45500':'tv','196400':'tv','64375':'tv','43887':'tv','37048':'movie','21732':'tv','13674':'tv','5660':'tv','16157':'movie','88865':'tv','46512':'tv','883768':'movie','553610':'movie','685274':'movie','910850':'movie','16308':'movie','72677':'tv','25797':'tv','20111':'tv','1146972':'movie','30093':'tv','21730':'tv','25504':'tv','37546':'tv','45835':'tv','61414':'tv','60667':'tv','76821':'tv','91566':'tv','122468':'tv','22914':'tv'});
const SEASON_IDS=Object.freeze({'20111':2,'60667':2,'76821':2});
module.exports=async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const id=String(req.query?.id||'');
 const rawSeason=req.query?.season;
 const season=rawSeason===undefined?0:Number(rawSeason);
 if(!Object.prototype.hasOwnProperty.call(WORKS,id)||
   (season!==0&&!(SEASON_IDS[id]===season))||
   (rawSeason!==undefined&&season===0)){
  res.setHeader('Cache-Control','no-store');
  return res.status(400).json({error:'Unverified Gundam ID or season'});
 }
 const apiKey=process.env.TMDB_API_KEY;
 if(!apiKey)return res.status(503).json({error:'Poster provider unavailable'});
 res.setHeader('Cache-Control','public, max-age=0, must-revalidate');
 res.setHeader('Vercel-CDN-Cache-Control','s-maxage=2592000');
 try{
  const route=season?'/tv/'+id+'/season/'+season:'/'+WORKS[id]+'/'+id;
  const url='https://api.themoviedb.org/3'+route+'?api_key='+encodeURIComponent(apiKey)+'&language=ja-JP';
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  if(!response.ok)throw Error('TMDB '+response.status);
  const data=await response.json();
  return res.status(200).json({id:Number(id),season_number:season||null,poster_path:data.poster_path||null});
 }catch(e){
  res.setHeader('Vercel-CDN-Cache-Control','no-store');
  return res.status(502).json({error:'Poster lookup unavailable'});
 }
};
