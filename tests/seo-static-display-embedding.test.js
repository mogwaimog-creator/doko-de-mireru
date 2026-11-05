'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {build}=require('../scripts/build-seo-static');
test('offline display-fixed payload embeds safely and never freezes providers',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-seo-fixed-'));
 try{
  const templates=path.join(dir,'templates'),output=path.join(dir,'output');
  await fs.mkdir(templates);
  await fs.writeFile(path.join(templates,'detail.html'),'<html><head><title>Template</title></head><body><h1 id="title">Template</h1><script>const params = new URLSearchParams(location.search);\nconst movieId = params.get("id");</script></body></html>');
  await fs.writeFile(path.join(templates,'person.html'),'<html><head></head><body><script>const params = new URLSearchParams(location.search);\nconst personId = params.get("id");</script></body></html>');
  const title='映画</script><script>alert(1)</script>';
  const record={schemaVersion:1,type:'movie',id:77,title,overview:'概要',
   displayFixed:{schemaVersion:1,type:'movie',id:77,fixed:{id:77,title,poster_path:'/poster.jpg'}}};
  const input=path.join(dir,'input.json');
  await fs.writeFile(input,JSON.stringify([record]));
  await build(input,output,templates);
  const html=await fs.readFile(path.join(output,'movie-77.html'),'utf8');
  const match=html.match(/<script type="application\/json" id="doko-fixed-detail">([^<]*)<\/script>/);
  assert.ok(match,'fixed JSON tag exists');
  const payload=JSON.parse(match[1]);
  assert.equal(payload.metadata.title,title);
  assert.equal(payload.metadata.poster_path,'/poster.jpg');
  assert.ok(!Object.hasOwn(payload.metadata,'streaming'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
