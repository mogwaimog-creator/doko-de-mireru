'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {exportRecords}=require('../scripts/export-seo-ledger-readonly');
test('explicit movie and TV export excludes internal and provider data',async()=>{
 const calls=[];
 const records=await exportRecords([{type:'movie',id:50014},{type:'tv',id:202879}],async(type,id)=>{
  calls.push(type+':'+id);
  return {schemaVersion:1,type,id,title:'タイトル',overview:'説明',posterPath:'/poster.jpg',extensions:{secret:'private'},streaming:[{provider_id:8}],commonNotes:{private:'memo'}};
 });
 assert.deepEqual(calls,['movie:50014','tv:202879']);
 assert.equal(records.length,2);
 for(const record of records){
  assert.deepEqual(Object.keys(record),['schemaVersion','type','id','title','overview','posterPath']);
  assert.equal(record.title,'タイトル');
  assert.equal(JSON.stringify(record).includes('secret'),false);
  assert.equal(JSON.stringify(record).includes('streaming'),false);
 }
});
test('missing, duplicate, mismatched or excessive IDs fail closed',async()=>{
 await assert.rejects(exportRecords([{type:'movie',id:1}],async()=>null),/missing/);
 await assert.rejects(exportRecords([{type:'movie',id:1},{type:'movie',id:1}],async(type,id)=>({type,id})),/Duplicate/);
 await assert.rejects(exportRecords([{type:'tv',id:1}],async()=>({type:'movie',id:1})),/mismatch/);
 await assert.rejects(exportRecords(Array.from({length:21},(_,i)=>({type:'movie',id:i+1}))),/1-20/);
});

test('read-only export feeds static SEO builder without provider calls',async()=>{
 const fs=require('node:fs/promises');
 const os=require('node:os');
 const path=require('node:path');
 const {build}=require('../scripts/build-seo-static');
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-export-build-'));
 try{
  const spec=require('./fixtures/seo-ledger-read-ids.json');
  const records=await exportRecords(spec,async(type,id)=>({
   schemaVersion:1,type,id,title:type==='movie'?'映画の検証':'TVの検証',
   overview:'固定の紹介文',posterPath:'/poster.jpg',
   extensions:{tmdbDetail:{id}},streaming:[{provider_id:8}]
  }));
  const input=path.join(dir,'export.json'),output=path.join(dir,'html');
  await fs.writeFile(input,JSON.stringify(records));
  assert.deepEqual(await build(input,output),['movie-50014.html','tv-202879.html']);
  for(const item of spec){
   const html=await fs.readFile(path.join(output,item.type+'-'+item.id+'.html'),'utf8');
   assert.match(html,/<title>/);
   assert.match(html,/固定の紹介文/);
   assert.doesNotMatch(html,/provider_id/);
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
