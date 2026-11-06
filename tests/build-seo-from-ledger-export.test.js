'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {buildFromExport}=require('../scripts/build-seo-from-ledger-export');
const good=()=>({schemaVersion:1,type:'movie',id:157336,title:'インターステラー',releaseDate:'2014-11-05',overview:'宇宙を旅する物語',posterPath:'/poster.jpg',verification:{identity:'verified',metadata:'verified'},errors:[],extensions:{tmdbDetail:{id:157336,title:'インターステラー',release_date:'2014-11-05',poster_path:'/poster.jpg',overview:'宇宙を旅する物語'}}});
test('verified real-film ledger record produces initial SEO HTML offline',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-ledger-seo-'));
 try{
  const input=path.join(dir,'export.json'),output=path.join(dir,'pages');
  await fs.writeFile(input,JSON.stringify({records:[good()],problems:[],readOnly:true}));
  const result=await buildFromExport(input,output);
  assert.deepEqual(result.pages,['movie-157336.html']);
  const manifest=JSON.parse(await fs.readFile(path.join(output,'seo-route-manifest.json'),'utf8'));
  assert.equal(manifest[0].ledgerVerified,true);
  const html=await fs.readFile(path.join(output,'movie-157336.html'),'utf8');
  assert.match(html,/<title>インターステラーはどこで見れる/);
  assert.doesNotMatch(html,/doko-fixed-detail|detailFormat=split|dokoCachedDetailFetch/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('unverified export cannot generate SEO pages',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-ledger-seo-'));
 try{
  const input=path.join(dir,'export.json'),output=path.join(dir,'pages'),row=good();
  row.verification.metadata='not_checked';
  await fs.writeFile(input,JSON.stringify({records:[row],problems:[]}));
  await assert.rejects(buildFromExport(input,output),/No explicitly verified/);
  await assert.rejects(fs.stat(output),{code:'ENOENT'});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('release assembly rejects manual or fixture manifests before copying any files',async()=>{
 const {build}=require('../scripts/stage-seo-full-preview');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-release-gate-'));
 try{
  const generated=path.join(dir,'generated'),output=path.join(dir,'candidate');
  await fs.mkdir(generated);
  await fs.writeFile(path.join(generated,'seo-route-manifest.json'),JSON.stringify([{url:'/detail.html?id=157336',file:'movie-157336.html'}]));
  await assert.rejects(build(generated,output,undefined,{releaseCandidate:true}),/verified work-ledger export pipeline/);
  await assert.rejects(fs.stat(output),{code:'ENOENT'});
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
