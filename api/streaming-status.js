'use strict';
// Read-only aggregate health check. Does not call TMDB or change Redis.
const {command}=require('./_redis');
const works=require('../data/streaming-works.json');
const PREFIX='doko:watch:v3:';
function currentWindow(){
  const local=new Date(Date.now()+9*3600000);
  const hour=local.getUTCHours();
  const day=(hour<6?new Date(local.getTime()-86400000):local).toISOString().slice(0,10);
  return day+'-'+(hour<6?'18':hour<18?'06':'18');
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=300, stale-while-revalidate=60');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const keys=works.map(w=>PREFIX+w.type+':'+w.id);
    const values=await command(['MGET',...keys]);
    const win=currentWindow();
    let stored=0,current=0,older=0,missing=0,invalid=0;
    for(const raw of values||[]){
      if(raw==null){missing++;continue;}
      try{
        const item=JSON.parse(raw);
        if(!Array.isArray(item.flatrate)||typeof item.checkedAt!=='string'||typeof item.window!=='string'){invalid++;continue;}
        stored++;
        if(item.window===win)current++;else older++;
      }catch{invalid++;}
    }
    // Account for a short/malformed Redis response without claiming success.
    if(!Array.isArray(values)||values.length!==works.length)return res.status(503).json({error:'Incomplete Redis response'});
    return res.status(200).json({total:works.length,stored,currentWindow:win,current,older,missing,invalid,complete:current===works.length});
  }catch(e){console.error('streaming-status:',e.message);return res.status(503).json({error:'Status temporarily unavailable'});}
};
