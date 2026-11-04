'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {build,normalizeRecord,filename}=require('../scripts/build-seo-static');

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
 assert.deepEqual(normalizeRecord(record),{kind:'work',type:'movie',id:50014,title:'ゴジラ'});
 assert.equal(filename(normalizeRecord(record)),'movie-50014.html');
});
