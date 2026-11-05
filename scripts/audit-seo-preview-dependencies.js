'use strict';
// Offline-only audit: enumerate external dependencies referenced by the original
// detail/person templates. No network, no credentials, no deployment.
const fs=require('node:fs');
const path=require('node:path');
function audit(root=path.resolve(__dirname,'..')){
 const pages=['detail.html','person.html'];
 const report={pages:[],missingLocal:[],apiReferences:[],externalHosts:[]};
 const apis=new Set(),hosts=new Set();
 for(const page of pages){
  const html=fs.readFileSync(path.join(root,page),'utf8');
  const local=new Set();
  // Literal src/href URLs in markup. Dynamic JS references require separate review.
  for(const match of html.matchAll(/(?:src|href)\s*=\s*["']([^"'#]+)["']/gi)){
   const url=match[1];
   if(/^(https?:)?\/\//.test(url)){try{hosts.add(new URL(url.startsWith('//')?'https:'+url:url).host);}catch{}continue;}
   if(/^(data:|mailto:|javascript:)/i.test(url)||url.includes('${'))continue;
   const clean=url.split(/[?#]/)[0];
   if(!clean||clean.startsWith('#'))continue;
   const file=path.resolve(root,clean.replace(/^\//,''));
   if(!file.startsWith(path.resolve(root)+path.sep))continue;
   local.add(clean);
   if(!fs.existsSync(file))report.missingLocal.push({page,reference:clean});
  }
  for(const match of html.matchAll(/\/api\/[\w/-]+/g))apis.add(match[0]);
  report.pages.push({page,localReferences:[...local].sort()});
 }
 report.apiReferences=[...apis].sort();
 report.externalHosts=[...hosts].sort();
 return report;
}
if(require.main===module){const result=audit();process.stdout.write(JSON.stringify(result,null,2)+'\n');}
module.exports={audit};
