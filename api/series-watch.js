'use strict';
// Read-only endpoint: never calls TMDB and never triggers refresh.
const {command}=require('./_redis');
const works=require('../data/godzilla-works.json');
const KEYPREFIX='doko:watch:v3:';
const MAX_AGE_MS=36*60*60*1000; // Daily Hobby updates plus scheduling tolerance.
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=120, stale-while-revalidate=60');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  if(req.query.series!=='godzilla')return res.status(400).json({error:'Unknown series'});
  try{
    const keys=works.map(w=>`${w.type}:${w.id}`);
    const values=await command(['MGET',...keys.map(k=>KEYPREFIX+k)]);
    const providers={},failures=[];
    for(let i=0;i<keys.length;i++){
      if(values?.[i]){
        try{const record=JSON.parse(values[i]);if(Array.isArray(record.flatrate)){const checked=Date.parse(record.checkedAt);
          const stale=!Number.isFinite(checked)||Date.now()-checked>MAX_AGE_MS||checked>Date.now()+60000;
          providers[keys[i]]={flatrate:record.flatrate,checkedAt:record.checkedAt,stale};continue;}}catch{}
      }
      failures.push(keys[i]);
    }
    return res.status(200).json({providers,failures,complete:failures.length===0});
  }catch(e){console.error('series-watch read:',e.message);return res.status(503).json({error:'保存済みの配信情報を読み込めません'});}
};
