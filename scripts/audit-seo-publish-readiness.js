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
  // Canonical must match the existing public URL, not the generated filename.
  // The deployment routing layer must be audited separately before publication.
  const expected='https://doko-de-mireru.com'+item.url.replace(/&/g,'&amp;');
  if(!canonical)issues.push(item.file+': missing canonical');
  else if(canonical!==expected)
   issues.push(item.file+': canonical differs from existing public URL');
  if(!html.includes('staticSeoId'))issues.push(item.file+': missing identity');
 }
 return {htmlReady:issues.length===0,routingVerified:false,ready:false,generated:manifest.length,issues,reason:'Production URL routing not installed or verified'};
}
if(require.main===module){
 const result=audit(process.argv[2]||'');
 console.log(JSON.stringify(result,null,2));
 if(!result.ready)process.exitCode=2;
}
module.exports={audit};
