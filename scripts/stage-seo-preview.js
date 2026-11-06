'use strict';
// Assemble an isolated Vercel preview directory. Never edit project vercel.json.
// Usage: node scripts/stage-seo-preview.js generated-directory preview-directory
const fs=require('node:fs/promises');
const path=require('node:path');
const {previewRules}=require('./seo-preview-route-candidates');
async function stage(generated,output,root=path.resolve(__dirname,'..')){
 const src=path.resolve(generated),dest=path.resolve(output),project=path.resolve(root);
 if(dest===project||dest===src||project.startsWith(dest+path.sep)||dest.startsWith(project+path.sep))
  throw Error('Preview output must be outside the project and generated source');
 const result=previewRules(src);
 const manifest=JSON.parse(await fs.readFile(path.join(src,'seo-route-manifest.json'),'utf8'));
 if(!manifest.length)throw Error('Empty preview manifest');
 await fs.mkdir(path.join(dest,'seo-pages'),{recursive:true});
 for(const entry of manifest)await fs.copyFile(path.join(src,entry.file),path.join(dest,'seo-pages',entry.file));
 await fs.copyFile(path.join(project,'detail.html'),path.join(dest,'detail-fallback.html'));
 await fs.copyFile(path.join(project,'person.html'),path.join(dest,'person-fallback.html'));
 const rewrites=[...result.rewrites,
  {source:'/detail.html',destination:'/detail-fallback.html'},
  {source:'/person.html',destination:'/person-fallback.html'}];
 await fs.writeFile(path.join(dest,'vercel.json'),JSON.stringify({rewrites},null,2)+'\n');
 await fs.writeFile(path.join(dest,'PREVIEW-ONLY.txt'),
  'ISOLATED SEO ROUTING PROTOTYPE. Do not deploy to production. Does not contain the full site or API dependencies. Verify Vercel query conditions and fallback behavior before any deployment.\n');
 return {deployable:false,files:manifest.length,rules:rewrites.length};
}
if(require.main===module){
 const [,,input,output]=process.argv;
 if(!input||!output){console.error('Usage: node scripts/stage-seo-preview.js generated-directory preview-directory');process.exitCode=2;}
 else stage(input,output).then(r=>console.log(JSON.stringify(r)),e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={stage};
