'use strict';
// Scheduled job. Read-only visitors never invoke this endpoint.
const {command}=require('./_redis');
const works=require('../data/streaming-works.json');
const KEYPREFIX='doko:watch:v3:';
const LOCK='doko:watch:v3:refresh-lock';
const CONCURRENCY=6;
function windowJST(now=Date.now()){
 const d=new Date(now+9*3600000);const hour=d.getUTCHours();
 const day=(hour<6?new Date(d.getTime()-86400000):d).toISOString().slice(0,10);
 return `${day}-${hour<6?'18':hour<18?'06':'18'}`;
}
async function provider(work){
 const key=process.env.TMDB_API_KEY;
 if(!key)throw new Error('TMDB_API_KEY unavailable');
 const url=`https://api.themoviedb.org/3/${work.type}/${work.id}/watch/providers?api_key=${encodeURIComponent(key)}`;
 const response=await fetch(url,{signal:AbortSignal.timeout(6500)});
 if(!response.ok)throw new Error(`TMDB ${response.status}`);
 const jp=(await response.json())?.results?.JP||{};
 return Array.isArray(jp.flatrate)?jp.flatrate.filter(p=>p&&Number.isInteger(p.provider_id)&&typeof p.logo_path==='string'):[];
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET only'});
 const secret=process.env.CRON_SECRET;
 if(!secret||req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:'Unauthorized'});
 const token=`${Date.now()}:${Math.random()}`;
 let acquired=false;
 try{
   acquired=(await command(['SET',LOCK,token,'NX','EX',180]))==='OK';
   if(!acquired)return res.status(409).json({error:'Update already running'});
   const win=windowJST();
   // Skip successful items within the current update window; retries only missing/failed entries.
   const keys=works.map(w=>`${w.type}:${w.id}`);
   const old=await command(['MGET',...keys.map(k=>KEYPREFIX+k)]);
   const pending=[];
   for(let i=0;i<works.length;i++){
     let record=null;try{if(old?.[i])record=JSON.parse(old[i]);}catch{}
     if(record?.window!==win)pending.push(works[i]);
   }
   let cursor=0,updated=0,failed=0;
   async function worker(){
     while(cursor<pending.length){
       const w=pending[cursor++];
       try{
         const flatrate=await provider(w);
         // Save each successful title independently, preserving previous data on failures.
         await command(['SET',KEYPREFIX+`${w.type}:${w.id}`,JSON.stringify({flatrate,checkedAt:new Date().toISOString(),window:win})]);
         updated++;
       }catch(e){failed++;console.error('watch update',`${w.type}:${w.id}`,e.message);}
     }
   }
   await Promise.all(Array.from({length:Math.min(CONCURRENCY,pending.length)},worker));
   return res.status(200).json({window:win,total:works.length,alreadyCurrent:works.length-pending.length,updated,failed,complete:failed===0});
 }catch(e){console.error('update-streaming',e.message);return res.status(503).json({error:'Update failed'});}
 finally{if(acquired){try{await command(['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",'1',LOCK,token]);}catch(e){console.error('unlock',e.message);}}}
};
module.exports._test={windowJST};
