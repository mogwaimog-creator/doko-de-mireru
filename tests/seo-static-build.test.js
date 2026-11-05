'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {build,normalizeRecord,filename,injectStaticIdentity}=require('../scripts/build-seo-static');

test('static SEO generator produces separate movie, TV and person HTML',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-seo-'));
 try{
  const input=path.join(dir,'records.json');
  const output=path.join(dir,'out');
  await fs.writeFile(input,JSON.stringify([
   {kind:'work',type:'movie',id:77,title:'映画A'},
   {kind:'work',type:'tv',id:77,title:'ドラマA'},
   {kind:'person',id:42,name:'俳優A'}
  ]));
  const names=await build(input,output);
  assert.deepEqual(names,['movie-77.html','tv-77.html','person-42.html']);
  const manifest=JSON.parse(await fs.readFile(path.join(output,'seo-route-manifest.json'),'utf8'));
  assert.deepEqual(manifest,[
   {url:'/detail.html?id=77',file:'movie-77.html'},
   {url:'/detail.html?id=77&type=tv',file:'tv-77.html'},
   {url:'/person.html?id=42',file:'person-42.html'}
  ]);
  const movie=await fs.readFile(path.join(output,'movie-77.html'),'utf8');
  const tv=await fs.readFile(path.join(output,'tv-77.html'),'utf8');
  const person=await fs.readFile(path.join(output,'person-42.html'),'utf8');
  assert.match(movie,/<title>映画Aはどこで見れる/);
  assert.match(tv,/detail\.html\?id=77&amp;type=tv/);
  assert.match(person,/person\.html\?id=42/);
  // Verify that generated files carry the identity consumed by the original page JS.
  assert.match(movie,/const staticSeoId = "77";/);
  assert.match(tv,/const staticSeoType = "tv";/);
  assert.match(person,/const staticSeoType = "person";/);
  assert.ok(movie.indexOf('params.set("id", staticSeoId)') < movie.indexOf('const movieId ='));
  assert.ok(person.indexOf('params.set("id", staticSeoId)') < person.indexOf('const personId ='));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('invalid IDs and duplicate records are rejected',async()=>{
 assert.throws(()=>normalizeRecord({kind:'work',type:'movie',id:'../5',title:'bad'}));
 assert.throws(()=>normalizeRecord({kind:'person',id:0,name:'bad'}));
 assert.equal(filename(normalizeRecord({kind:'work',type:'movie',id:7,title:'ok'})),'movie-7.html');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-seo-'));
 try{
  const input=path.join(dir,'records.json'),output=path.join(dir,'out');
  await fs.writeFile(input,JSON.stringify([
   {kind:'work',type:'movie',id:7,title:'A'},
   {kind:'work',type:'movie',id:7,title:'B'}
  ]));
  await assert.rejects(build(input,output),/Duplicate page/);
  await assert.rejects(fs.stat(output),{code:'ENOENT'});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('existing shared work-ledger export is accepted without a kind field',async()=>{
 const record={schemaVersion:1,type:'movie',id:50014,title:'ゴジラ'};
 assert.deepEqual(normalizeRecord(record),{kind:'work',type:'movie',id:50014,title:'ゴジラ',overview:undefined});
 assert.equal(filename(normalizeRecord(record)),'movie-50014.html');
});

test('generated HTML injects identity before the original page reads query params',()=>{
 const detail='const params = new URLSearchParams(window.location.search); const movieId = params.get("id");';
 const rendered=injectStaticIdentity(detail,{kind:'work',type:'tv',id:202879});
 assert.ok(rendered.indexOf('params.set("id"') < rendered.indexOf('const movieId ='));
 assert.match(rendered,/params\.set\("type", staticSeoType\)/);
 assert.match(rendered,/Static SEO identity mismatch/);
 const person='const params = new URLSearchParams(window.location.search); const personId = params.get("id");';
 assert.match(injectStaticIdentity(person,{kind:'person',id:42}),/params\.set\("id", staticSeoId\)/);
 assert.throws(()=>injectStaticIdentity('no anchor',{kind:'person',id:42}),/identity anchor/);
});

test('generated identity script executes with empty query and rejects mismatches',()=>{
 const vm=require('node:vm');
 const source='const params = new URLSearchParams(window.location.search); const movieId = params.get("id"); const mediaType = params.get("type") || "movie";';
 const generated=injectStaticIdentity(source,{kind:'work',type:'tv',id:202879});
 function evaluate(search){
  const context={window:{location:{search}},URLSearchParams};
  vm.runInNewContext(generated+';globalResult={movieId,mediaType};',context,{timeout:1000});
  return context.globalResult;
 }
 assert.equal(evaluate('').movieId,'202879');
 assert.equal(evaluate('').mediaType,'tv');
 assert.equal(evaluate('?id=202879&type=tv').movieId,'202879');
 assert.throws(()=>evaluate('?id=999&type=tv'),/identity mismatch/);
 assert.throws(()=>evaluate('?id=202879&type=movie'),/type mismatch/);
});

test('static generator preserves fixed work overview and person biography',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-seo-body-'));
 try{
  const input=path.join(dir,'records.json'),output=path.join(dir,'out');
  await fs.writeFile(input,JSON.stringify([
   {schemaVersion:1,type:'movie',id:77,title:'映画A',overview:'あらすじ & 物語'},
   {kind:'person',id:42,name:'俳優A',biography:'人物紹介 & 経歴'}
  ]));
  await build(input,output);
  const movie=await fs.readFile(path.join(output,'movie-77.html'),'utf8');
  const person=await fs.readFile(path.join(output,'person-42.html'),'utf8');
  assert.ok(movie.includes('あらすじ &amp; 物語'));
  assert.ok(person.includes('人物紹介 &amp; 経歴'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('publication audit accepts legacy canonical but blocks unverified routing',async()=>{
 const {audit}=require('../scripts/audit-seo-publish-readiness');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-seo-audit-'));
 try{
  const input=path.join(dir,'records.json'),output=path.join(dir,'out');
  await fs.writeFile(input,JSON.stringify([
   {kind:'work',type:'movie',id:77,title:'映画A'},
   {kind:'work',type:'tv',id:77,title:'ドラマA'},
   {kind:'person',id:42,name:'俳優A'}
  ]));
  await build(input,output);
  const result=audit(output);
  assert.equal(result.generated,3);
  assert.deepEqual(result.issues,[]);
  assert.equal(result.htmlReady,true);
  assert.equal(result.routingVerified,false);
  assert.equal(result.ready,false);
  const tv=path.join(output,'tv-77.html');
  const html=await fs.readFile(tv,'utf8');
  await fs.writeFile(tv,html.replace('detail.html?id=77&amp;type=tv','detail.html?id=999&amp;type=tv'));
  assert.equal(audit(output).htmlReady,false);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
