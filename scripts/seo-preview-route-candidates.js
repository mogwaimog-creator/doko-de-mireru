'use strict';
// Generate bounded preview-only routing candidates; NEVER modify vercel.json.
// Existing detail.html/person.html take precedence over rewrites on Vercel.
// These candidates are NOT deployable until templates are relocated in a preview build.
const fs=require('node:fs');
const path=require('node:path');
function previewRules(output){
 const manifest=JSON.parse(fs.readFileSync(path.join(output,'seo-route-manifest.json'),'utf8'));
 if(!Array.isArray(manifest)||manifest.length>20)throw Error('Preview limited to 20 records');
 const rules=[];
 const seen=new Set();
 for(const entry of manifest){
  const u=new URL(entry.url,'https://doko-de-mireru.com');
  const id=u.searchParams.get('id');
  const type=u.searchParams.get('type');
  if(!/^\d{1,10}$/.test(id||'')||Number(id)<=0)throw Error('Invalid ID');
  if(!/^((movie|tv|person)-\d{1,10})\.html$/.test(entry.file))throw Error('Invalid file');
  const category=u.pathname==='/person.html'?'person':u.pathname==='/detail.html'?(type==='tv'?'tv':'movie'):null;
  if(!category||entry.file!==category+'-'+id+'.html')throw Error('Route/file mismatch');
  const key=category+':'+id;
  if(seen.has(key))throw Error('Duplicate preview route');
  seen.add(key);
  const has=[{type:'query',key:'id',value:id}];
  if(category==='tv')has.push({type:'query',key:'type',value:'tv'});
  if(category==='movie')has.push({type:'query',key:'type',value:'movie'});
  rules.push({source:u.pathname,has,destination:'/seo-pages/'+entry.file});
 }
 // Movie legacy URLs often omit type. A separate missing-type rule is necessary.
 // Do not silently map unknown type=... to a movie.
 const expanded=[];
 for(const rule of rules){
  if(rule.destination.startsWith('/seo-pages/movie-')){
   expanded.push({...rule,has:rule.has.filter(x=>x.key!=='type'),missing:[{type:'query',key:'type'}]});
   expanded.push(rule);
  }else expanded.push(rule);
 }
 return {deployable:false,reason:'Requires preview-only template relocation and HTTP verification',rewrites:expanded};
}
module.exports={previewRules};
