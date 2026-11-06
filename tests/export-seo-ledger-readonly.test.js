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
  assert.deepEqual(Object.keys(record),['schemaVersion','type','id','title','originalTitle','releaseDate','overview','runtimeMinutes','genres','posterPath','backdropPath','directors','cast','collectionId','collectionName','seasons','status','voteAverage','voteCount']);
  assert.equal(record.title,'タイトル');
  assert.equal(record.directors,null);
  assert.equal(record.cast,null);
  assert.equal(JSON.stringify(record).includes('secret'),false);
  assert.equal(JSON.stringify(record).includes('streaming'),false);
 }
});
test('missing, duplicate, mismatched or excessive IDs fail closed',async()=>{
 await assert.rejects(exportRecords([{type:'movie',id:1}],async()=>null),/missing/);
 await assert.rejects(exportRecords([{type:'movie',id:1},{type:'movie',id:1}],async(type,id)=>({schemaVersion:1,type,id,title:'作品'})),/Duplicate/);
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
   assert.doesNotMatch(html,/<script type="application\/json" id="doko-fixed-detail">/);
   assert.doesNotMatch(html,/\"provider_id\":8/);
  }
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});


test('existing work export accepts bounded IDs with GET only and retains review state',async()=>{
 const {exportLedger}=require('../scripts/export-work-ledger-readonly');
 const calls=[];
 const run=async args=>{calls.push(args);assert.equal(args[0],'GET');return JSON.stringify({schemaVersion:1,type:'movie',id:157336,title:'映画',verification:{identity:'verified',metadata:'verified'},extensions:{tmdbDetail:{id:157336}}});};
 const result=await exportLedger(run,[{type:'movie',id:157336}]);
 assert.deepEqual(calls,[['GET','doko:work:v1:movie:157336']]);
 assert.equal(result.records[0].verification.metadata,'verified');
 assert.equal(result.records[0].extensions.tmdbDetail.id,157336);
 assert.equal(result.readOnly,true);
 await assert.rejects(exportLedger(run,[{type:'movie',id:1},{type:'movie',id:1}]),/Duplicate/);
 await assert.rejects(exportLedger(run,[]),/1-20/);
 assert.equal(calls.length,1,'invalid input performs no Redis request');
});

test('display capture reuses saved movie and TV data with bounded reads and excludes internal fields',async()=>{
 const {exportDisplayInputs}=require('../scripts/export-work-ledger-readonly');
 const movie={schemaVersion:1,type:'movie',id:157336,title:'保存済み映画',overview:'概要',posterPath:'/p.jpg',verification:{metadata:'not_checked'},commonNotes:{private:'do not export'},extensions:{tmdbDetail:{id:157336,title:'保存済み映画',runtime:169,internalSecret:'omit','watch/providers':{results:{US:{}}}}}};
 const before=JSON.stringify(movie),calls=[];
 const result=await exportDisplayInputs({records:[movie]},async args=>{
  calls.push(args);assert.ok(['SCAN','GET'].includes(args[0]));
  if(args[0]==='SCAN')return ['123',['other:key','doko:work:v1:tv:1','doko:work:v1:tv:1','doko:work:v1:tv:2','doko:work:v1:tv:3','doko:work:v1:tv:4']];
  if(args[1].startsWith('doko:work:')){const id=Number(args[1].split(':').pop());return JSON.stringify({schemaVersion:1,type:'tv',id,title:'保存済みTV'+id,genres:[{id:id===1?16:18}],extensions:{tmdbDetail:{id,name:'保存済みTV'+id,seasons:[],number_of_episodes:10}}});}
  return JSON.stringify({checkedAt:'2026-11-06T00:00:00Z',data:{results:{JP:{flatrate:[{provider_id:8}],rent:[],buy:[]},US:{flatrate:[{provider_id:99}]}}}});
 });
 assert.equal(calls.length,6,'one scan, at most three TV reads, two provider reads');
 assert.equal(calls.filter(a=>a[0]==='SCAN').length,1);
 assert.deepEqual(result.works.map(w=>[w.type,w.id]),[['movie',157336],['tv',2]]);
 assert.equal(result.works[0].snapshot.runtime,169);
 assert.equal(result.works[1].snapshot.number_of_episodes,10);
 assert.deepEqual(result.works[0].providers.results.JP.flatrate,[{provider_id:8}]);
 for(const key of ['commonNotes','verification','internalSecret','watch/providers'])assert.equal(JSON.stringify(result).includes(key),false);
 assert.deepEqual(Object.keys(result.works[0].providers.results),['JP']);
 assert.equal(JSON.stringify(movie),before,'capture never changes local review flags or work data');
});
test('display capture stops after one empty scan and does not invent a missing provider cache',async()=>{
 const {exportDisplayInputs}=require('../scripts/export-work-ledger-readonly');
 const source={records:[{schemaVersion:1,type:'movie',id:157336,title:'映画',extensions:{tmdbDetail:{id:157336,title:'映画'}}}]};
 let calls=0;
 await assert.rejects(exportDisplayInputs(source,async()=>{calls++;return ['456',[]];}),/cursor=456/);
 assert.equal(calls,1);
 const result=await exportDisplayInputs(source,async args=>{
  if(args[0]==='SCAN')return ['0',['doko:work:v1:tv:7']];
  if(args[1].startsWith('doko:work:'))return JSON.stringify({schemaVersion:1,type:'tv',id:7,title:'TV',extensions:{tmdbDetail:{id:7,name:'TV'}}});
  return null;
 });
 assert.ok(result.works.every(w=>w.providers===null));
});
