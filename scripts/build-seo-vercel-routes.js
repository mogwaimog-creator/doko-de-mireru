'use strict';
// EXPERIMENTAL ONLY: query-aware Vercel rewrites to prebuilt static HTML.
// IMPORTANT: Vercel filesystem routes take precedence over rewrites. Existing
// detail.html/person.html may prevent these rules from ever matching.
// Do not deploy generated config without a real preview deployment test.
// No runtime function, Redis read, TMDB request or URL change per page view.
// Only generate routes for records present in the audited manifest.
const fs=require('node:fs');
const path=require('node:path');
function makeRewrites(manifest) {
  if (!Array.isArray(manifest)) throw Error('Invalid manifest');
  const routes=[],seen=new Set();
  for(const item of manifest){
    if(!item||typeof item.url!=='string'||typeof item.file!=='string')throw Error('Invalid entry');
    const match=/^(movie|tv|person)-([1-9]\d{0,9})\.html$/.exec(item.file);
    if(!match)throw Error('Invalid generated filename: '+item.file);
    const [,kind,id]=match;
    const expected=kind==='person'?'/person.html?id='+id:'/detail.html?id='+id+(kind==='tv'?'&type=tv':'');
    if(item.url!==expected)throw Error('Manifest URL mismatch: '+item.file);
    if(seen.has(item.file))throw Error('Duplicate: '+item.file);
    seen.add(item.file);
    const source=kind==='person'?'/person.html':'/detail.html';
    const has=[{type:'query',key:'id',value:id}];
    if(kind==='tv')has.push({type:'query',key:'type',value:'tv'});
    if(kind==='movie') {
      // Support both canonical ?id=N and explicit ?id=N&type=movie.
      routes.push({source,has:[...has,{type:'query',key:'type',value:'movie'}],destination:'/seo-static/'+item.file});
      routes.push({source,has,missing:[{type:'query',key:'type'}],destination:'/seo-static/'+item.file});
    }else{
      if(kind==='person')routes.push({source,has,missing:[{type:'query',key:'type'}],destination:'/seo-static/'+item.file});
      else routes.push({source,has,destination:'/seo-static/'+item.file});
    }
  }
  return routes;
}
function build(manifestPath,baseConfigPath,outputPath){
  if(process.env.SEO_ALLOW_UNVERIFIED_REWRITES!=='1')throw Error('Unverified: existing detail.html/person.html may shadow rewrites; preview test required');
  const manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  const base=JSON.parse(fs.readFileSync(baseConfigPath,'utf8'));
  const generated=makeRewrites(manifest);
  // Preserve existing rewrites and cron configuration.
  const config={...base,rewrites:[...generated,...(base.rewrites||[])]};
  fs.writeFileSync(outputPath,JSON.stringify(config,null,2)+'\n');
  return generated.length;
}
if(require.main===module){
  const [manifest,base,out]=process.argv.slice(2);
  if(!manifest||!base||!out)throw Error('Usage: node scripts/build-seo-vercel-routes.js manifest.json vercel.json output.json');
  console.log('Generated '+build(manifest,base,out)+' static rewrite rules');
}
module.exports={makeRewrites,build};
