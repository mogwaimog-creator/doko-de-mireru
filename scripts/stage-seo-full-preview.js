'use strict';
// Assemble a complete *offline* preview from tracked project files only.
// This is not a deployment. Never copies untracked secrets or modifies the repo.
const fs=require('node:fs');
const path=require('node:path');
const cp=require('node:child_process');
const {stage}=require('./stage-seo-preview');
async function build(generated,output,root=path.resolve(__dirname,'..')){
 const project=path.resolve(root),dest=path.resolve(output),src=path.resolve(generated);
 if(dest===project||dest===src||dest.startsWith(project+path.sep)||project.startsWith(dest+path.sep)||dest.startsWith(src+path.sep))throw Error('Output must be isolated from project and generated source');
 if(fs.existsSync(dest))throw Error('Refusing to overwrite existing output');
 const tracked=cp.execFileSync('git',['-C',project,'ls-files','-z'],{encoding:'buffer'}).toString('utf8').split('\0').filter(Boolean);
 const exclude=/^(?:\.github\/|docs\/|tests\/|\.git\/|\.env(?:\.|$)|README(?:\.|$)|LICENSE(?:\.|$))/;
 const copied=[];
 for(const relative of tracked){
  if(exclude.test(relative))continue;
  const from=path.join(project,relative),to=path.join(dest,relative);
  if(!fs.existsSync(from)||!fs.statSync(from).isFile())continue;
  fs.mkdirSync(path.dirname(to),{recursive:true});
  fs.copyFileSync(from,to);
  copied.push(relative);
 }
 if(!copied.includes('api/search.js'))throw Error('Missing critical API dependency: api/search.js');
 for(const name of ['detail.html','person.html','vercel.json'])if(!copied.includes(name))throw Error('Missing required tracked file: '+name);
 // Stage preview routes in a separate temporary directory, then overlay.
 const overlay=dest+'-routing-overlay';
 if(fs.existsSync(overlay))throw Error('Routing overlay already exists');
 try{
  await stage(src,overlay,project);
  for(const name of ['detail-fallback.html','person-fallback.html','vercel.json','PREVIEW-ONLY.txt'])fs.copyFileSync(path.join(overlay,name),path.join(dest,name));
  fs.cpSync(path.join(overlay,'seo-pages'),path.join(dest,'seo-pages'),{recursive:true});
  // Physical legacy templates must not shadow the preview rewrites.
  fs.unlinkSync(path.join(dest,'detail.html'));
  fs.unlinkSync(path.join(dest,'person.html'));
  const config=JSON.parse(fs.readFileSync(path.join(dest,'vercel.json'),'utf8'));
  if(config.crons||config.functions)throw Error('Preview routing config unexpectedly includes cron/functions overrides');
  const original=JSON.parse(fs.readFileSync(path.join(project,'vercel.json'),'utf8'));
  // Retain existing non-SEO routes; keep preview free of production cron.
  const legacy=original.rewrites||[];
  for(const rule of legacy){
   if(config.rewrites.some(candidate=>candidate.source===rule.source))throw Error('Preview rewrite conflicts with existing route: '+rule.source);
  }
  config.rewrites.push(...legacy);
  // Preserve original function configuration only after translating template paths
  // relocated in this preview. Never silently drop production function settings.
  if(original.functions){
   const functions=JSON.parse(JSON.stringify(original.functions));
   for(const settings of Object.values(functions)){
    if(typeof settings.includeFiles==='string')settings.includeFiles=settings.includeFiles.replace(/detail\.html/g,'detail-fallback.html').replace(/person\.html/g,'person-fallback.html');
   }
   config.functions=functions;
  }
  fs.writeFileSync(path.join(dest,'vercel.json'),JSON.stringify(config,null,2)+'\n');
  fs.writeFileSync(path.join(dest,'PREVIEW-ONLY.txt'),'OFFLINE FULL-SITE SEO PREVIEW CANDIDATE. NOT DEPLOYED OR HTTP VERIFIED. Review rewrites and Vercel billing before any deployment.\n');
  return {deployable:false,trackedFilesCopied:copied.length,hasSearchApi:true,rewrites:config.rewrites.length};
 }finally{fs.rmSync(overlay,{recursive:true,force:true});}
}
if(require.main===module){const [,,src,dest]=process.argv;if(!src||!dest){console.error('Usage: node scripts/stage-seo-full-preview.js generated-dir output-dir');process.exitCode=2;}else build(src,dest).then(r=>console.log(JSON.stringify(r)),e=>{console.error(e.message);process.exitCode=1;});}
module.exports={build};
