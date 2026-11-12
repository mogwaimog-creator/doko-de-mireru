'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {store}=require('../prototype/work-ledger');
test('10 works integrated lifecycle with disk persistence and cached reuse',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ledger-e2e-'));
 const file=path.join(dir,'ledger.json');let fetches=0;
 const fetchMock=(id)=>{fetches++;return {title:'作品'+id,posterPath:'/poster/'+id+'.jpg',overview:'紹介',seasonCount:99,providers:['omit']}};
 const s=store({write:x=>fs.writeFileSync(file,x),read:()=>fs.readFileSync(file,'utf8')});
 try{
  for(let i=1;i<=10;i++)assert.equal(s.register(i<=6?'movie':'tv',i,fetchMock(i)),true);
  assert.equal(s.pending().length,10);
  s.member('movie',1,'watchOrder','godzilla',{shortIntro:'手動紹介'});
  s.member('movie',1,'feature','classics',{note:'名作棚'});
  s.relate('movie',1,'movie',2);s.relate('movie',1,'movie',2);
  s.edit('movie',1,{title:'確認済み作品'});s.confirm('movie',1);
  s.automatic('movie',1,{title:'誤上書き'});
  assert.equal(s.display('movie',1).title,'確認済み作品');
  const eid=s.error('tv',7,'ポスター不明');
  assert.throws(()=>s.confirm('tv',7),/unresolved/);
  s.edit('tv',7,{posterPath:'/fixed.jpg'});s.resolve('tv',7,eid);s.confirm('tv',7);
  for(let i=2;i<=10;i++)if(i!==7)s.confirm(i<=6?'movie':'tv',i);
  assert.equal(s.pending().length,0);assert.equal(s.errors()[0].status,'resolved');
  s.save();const restored=store({read:()=>fs.readFileSync(file,'utf8')});restored.load();
  assert.equal(restored.audit().count,10);
  assert.equal(restored.display('movie',1).title,'確認済み作品');
  assert.equal(restored.display('movie',1).memberships.length,2);
  assert.equal(restored.display('tv',7).posterPath,'/fixed.jpg');
  const raw=JSON.parse(restored.save());
  assert.deepEqual(raw.records[0].relatedWorkIds,['movie:2']);
  assert.equal(raw.records[0].pageExtras['feature:classics'].note,'名作棚');
  assert.equal(raw.records[0].fields.seasonCount,undefined);
  assert.equal(raw.records[0].fields.providers,undefined);
  const before=restored.save();
  for(let i=0;i<100;i++)restored.display('movie',1);
  assert.equal(restored.save(),before);assert.equal(fetches,10);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});