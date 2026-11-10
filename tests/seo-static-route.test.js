'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseStaticSeoPath}=require('../scripts/seo-static-route');
test('static paths identify the same work as legacy query URLs',()=>{
 assert.deepEqual(parseStaticSeoPath('/seo-pages/movie-50014.html'),{kind:'work',type:'movie',id:50014,legacyUrl:'/detail.html?id=50014'});
 assert.deepEqual(parseStaticSeoPath('/seo-pages/tv-202879.html'),{kind:'work',type:'tv',id:202879,legacyUrl:'/detail.html?id=202879&type=tv'});
 assert.deepEqual(parseStaticSeoPath('/seo-pages/person-42.html'),{kind:'person',id:42,legacyUrl:'/person.html?id=42'});
});
test('static path parser rejects invalid paths and IDs',()=>{
 for(const path of ['/seo-pages/movie-0.html','/seo-pages/movie-../1.html','/seo-pages/movie-abc.html','/detail.html?id=1','/seo-pages/movie-1.html/extra','/seo-pages/movie-12345678901.html'])assert.equal(parseStaticSeoPath(path),null);
});

test('legacy detail URL cannot be rewritten by pathname alone without confusing movie and TV',()=>{
 const movie=new URL('https://doko-de-mireru.com/detail.html?id=77');
 const tv=new URL('https://doko-de-mireru.com/detail.html?id=77&type=tv');
 assert.equal(movie.pathname,tv.pathname);
 assert.notEqual(movie.search,tv.search);
 // Guardrail: never introduce a blanket /detail.html -> /seo-pages/movie-*.html rewrite.
 // Query-aware routing needs separate validation and must not add per-hit Redis calls.
});
test('generated static paths do not replace existing canonical URL identities',()=>{
 for(const [path,legacy] of [
  ['/seo-pages/movie-77.html','/detail.html?id=77'],
  ['/seo-pages/tv-77.html','/detail.html?id=77&type=tv'],
  ['/seo-pages/person-42.html','/person.html?id=42']
 ])assert.equal(parseStaticSeoPath(path).legacyUrl,legacy);
});

test('offline preview candidates distinguish movie, TV, person and reject unknown type',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {previewRules}=require('../scripts/seo-preview-route-candidates');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doko-route-'));
 try{
  fs.writeFileSync(path.join(dir,'seo-route-manifest.json'),JSON.stringify([
   {url:'/detail.html?id=77',file:'movie-77.html'},
   {url:'/detail.html?id=77&type=tv',file:'tv-77.html'},
   {url:'/person.html?id=42',file:'person-42.html'}
  ]));
  const result=previewRules(dir);
  assert.equal(result.deployable,false);
  assert.equal(result.rewrites.length,4);
  assert.deepEqual(result.rewrites[0].missing,[{type:'query',key:'type'}]);
  assert.deepEqual(result.rewrites[1].has,[{type:'query',key:'id',value:'77'},{type:'query',key:'type',value:'movie'}]);
  assert.deepEqual(result.rewrites[2].has,[{type:'query',key:'id',value:'77'},{type:'query',key:'type',value:'tv'}]);
  assert.equal(result.rewrites[3].destination,'/seo-pages/person-42.html');
  assert.equal(result.rewrites.some(r=>r.destination.includes('/api/')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('preview routing fails closed on mismatched files, duplicate records and oversized batches',()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {previewRules}=require('../scripts/seo-preview-route-candidates');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'doko-route-negative-'));
 const file=path.join(dir,'seo-route-manifest.json');
 const check=records=>{fs.writeFileSync(file,JSON.stringify(records));assert.throws(()=>previewRules(dir));};
 try{
  check([{url:'/detail.html?id=77&type=tv',file:'movie-77.html'}]);
  check([{url:'/detail.html?id=77',file:'movie-77.html'},{url:'/detail.html?id=77',file:'movie-77.html'}]);
  check(Array.from({length:21},(_,i)=>({url:'/person.html?id='+(i+1),file:'person-'+(i+1)+'.html'})));
  check([{url:'/detail.html?id=77&type=unknown',file:'movie-77.html'}]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('isolated preview staging leaves production config untouched and keeps fallbacks',async()=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
 const {stage}=require('../scripts/stage-seo-preview');
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'doko-stage-'));
 const generated=path.join(base,'generated'),output=path.join(base,'preview'),root=path.join(base,'root');
 try{
  fs.mkdirSync(generated);fs.mkdirSync(root);
  fs.writeFileSync(path.join(generated,'seo-route-manifest.json'),JSON.stringify([
   {url:'/detail.html?id=77',file:'movie-77.html'},
   {url:'/detail.html?id=77&type=tv',file:'tv-77.html'},
   {url:'/person.html?id=42',file:'person-42.html'}]));
  for(const name of ['movie-77.html','tv-77.html','person-42.html'])fs.writeFileSync(path.join(generated,name),name);
  fs.writeFileSync(path.join(root,'detail.html'),'original detail');
  fs.writeFileSync(path.join(root,'person.html'),'original person');
  fs.writeFileSync(path.join(root,'vercel.json'),'{"original":true}');
  const result=await stage(generated,output,root);
  assert.equal(result.deployable,false);
  assert.equal(result.files,3);
  const config=JSON.parse(fs.readFileSync(path.join(output,'vercel.json'),'utf8'));
  assert.equal(config.rewrites.length,6);
  assert.deepEqual(config.rewrites.slice(-2),[
   {source:'/detail.html',destination:'/detail-fallback.html'},
   {source:'/person.html',destination:'/person-fallback.html'}]);
  assert.equal(fs.readFileSync(path.join(root,'vercel.json'),'utf8'),'{"original":true}');
  assert.equal(fs.readFileSync(path.join(output,'detail-fallback.html'),'utf8'),'original detail');
  assert.equal(fs.readFileSync(path.join(output,'seo-pages','tv-77.html'),'utf8'),'tv-77.html');
  await assert.rejects(stage(generated,root,root));
 }finally{fs.rmSync(base,{recursive:true,force:true});}
});
