'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {build}=require('../scripts/build-seo-static');

test('generated detail page embeds a usable fixed reader without extra requests',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-integration-'));
 try{
  const input=path.join(dir,'input.json'),out=path.join(dir,'out');
  await fs.writeFile(input,JSON.stringify([{schemaVersion:1,type:'movie',id:77,title:'映画A',extensions:{tmdbDetail:{id:77,title:'映画A',poster_path:'/poster.jpg',release_date:'2025-01-01'}}}]));
  await build(input,out);
  const html=await fs.readFile(path.join(out,'movie-77.html'),'utf8');
  const match=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('window.dokoReadFixedDetail=readFixedDetail;'));
  assert.ok(match,'reader must be embedded in the generated HTML');
  const payload=html.match(/<script type="application\/json" id="doko-fixed-detail">([^<]+)<\/script>/);
  assert.ok(payload);
  const node={textContent:payload[1],getAttribute(key){return key==='type'?'application/json':null;}};
  const document={getElementById(key){return key==='doko-fixed-detail'?node:null;}};
  const window={};
  vm.runInNewContext(match[1],{window,document},{timeout:1000});
  const fixed=window.dokoReadFixedDetail(document,'movie',77);
  assert.equal(fixed.title,'映画A');
  assert.equal(fixed.poster_path,'/poster.jpg');
  assert.equal(window.dokoReadFixedDetail(document,'tv',77),null);
  assert.match(html,/async function loadMovie\(\)/);
  assert.match(html,/await fetch\(/); // dynamic streaming still uses the existing API
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
