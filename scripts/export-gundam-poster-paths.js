// One-time offline export of verified Gundam poster paths.
// Usage: TMDB_API_KEY=... node scripts/export-gundam-poster-paths.js
// Does not access Vercel, write to production, or change any page.
// Review output before copying it into gundam.html.
const fs=require('node:fs');
const html=fs.readFileSync('gundam.html','utf8');
const key=process.env.TMDB_API_KEY;
if(!key){console.error('TMDB_API_KEY is required locally; do not commit it.');process.exit(1);}
const knownSection=html.match(/const gundamKnownIds=\{([\s\S]*?)\n\};/);
const seasonsSection=html.match(/const gundamSeasonWorks=\{([\s\S]*?)\n\};/);
if(!knownSection||!seasonsSection)throw Error('Gundam mappings not found');
const known=[...knownSection[1].matchAll(/'([^']+)':\{id:(\d+),type:'(tv|movie)'\}/g)].map(m=>({title:m[1],id:+m[2],type:m[3]}));
const seasons=[...seasonsSection[1].matchAll(/'([^']+)':\{id:(\d+),season:(\d+)\}/g)].map(m=>({title:m[1],id:+m[2],season:+m[3],type:'tv'}));
const targets=[...known,...seasons];
const pathPattern=/^\/[a-zA-Z0-9_/-]+\.(?:jpg|jpeg|png|webp)$/;
async function run(){
 const result={},failures=[];
 const seen=new Set();
 for(const work of targets){
  const unique=work.type+':'+work.id+':'+(work.season||0);
  if(seen.has(unique))throw Error('Duplicate TMDB work/season '+unique);
  seen.add(unique);
  const route=work.season?`tv/${work.id}/season/${work.season}`:`${work.type}/${work.id}`;
  const url=`https://api.themoviedb.org/3/${route}?language=ja-JP&api_key=${encodeURIComponent(key)}`;
  try{
   const res=await fetch(url,{headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('HTTP '+res.status);
   const data=await res.json();
   if(!pathPattern.test(data.poster_path||''))throw Error('poster_path missing or invalid');
   result[work.title]=data.poster_path;
  }catch(e){failures.push({title:work.title,reason:e.message})}
 }
 console.log(JSON.stringify({posters:result,failures},null,2));
 if(failures.length)process.exitCode=2;
}
run().catch(e=>{console.error(e);process.exitCode=1});
