'use strict';
// Offline publication safety check. No network, Redis, TMDB or deployment.
const fs=require('node:fs');
const path=require('node:path');
function audit(output){
 const manifest=JSON.parse(fs.readFileSync(path.join(output,'seo-route-manifest.json'),'utf8'));
 const issues=[];
 for(const item of manifest){
  const html=fs.readFileSync(path.join(output,item.file),'utf8');
  const canonical=html.match(/<link\b[^>]*\brel="canonical"[^>]*\bhref="([^"]+)"/i)?.[1];
  const staticUrl='/seo-pages/'+item.file;
  if(!canonical)issues.push(item.file+': missing canonical');
  else if(new URL(canonical).pathname!==staticUrl)
   issues.push(item.file+': canonical points away from generated static URL');
  if(!html.includes('staticSeoId'))issues.push(item.file+': missing identity');
 }
 return {ready:issues.length===0,generated:manifest.length,issues};
}
if(require.main===module){
 const result=audit(process.argv[2]||'');
 console.log(JSON.stringify(result,null,2));
 if(!result.ready)process.exitCode=2;
}
module.exports={audit};
