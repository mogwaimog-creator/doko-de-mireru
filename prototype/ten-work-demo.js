'use strict';
// 10-work offline demonstration. Run: node prototype/ten-work-demo.js
// Sample titles/IDs are fictional fixtures, NOT TMDB IDs. No network or production access.
const assert = require('node:assert/strict');
const {store}=require('./work-ledger');
const examples=[
 ['movie',101,'映画サンプルA'],['movie',102,'映画サンプルB'],['movie',103,'映画サンプルC'],
 ['movie',104,'映画サンプルD'],['movie',105,'映画サンプルE'],['movie',106,'映画サンプルF'],
 ['tv',201,'TVサンプルA'],['tv',202,'TVサンプルB'],['tv',203,'TVサンプルC'],['tv',204,'TVサンプルD']
];
function run(){
 const s=store(),checks=[];
 function check(label,fn){fn();checks.push(label)}
 check('10作品の初回登録と重複防止',()=>{
  for(const [type,id,title] of examples)assert.equal(s.register(type,id,{title,overview:'検証用あらすじ',posterPath:'/sample.jpg',seasons:[{id:1}],streaming:[{provider:'test'}]}),true);
  assert.equal(s.register('movie',101,{title:'重複'}),false);
  assert.equal(s.audit().count,10);
  const raw=JSON.parse(s.save());
  assert(raw.records.every(r=>!('seasons' in r.fields)&&!('streaming' in r.fields)));
 });
 check('シリーズ・特集の二重所属と関連ID',()=>{
  s.member('movie',101,'watchOrder','godzilla',{order:1,shortIntro:'手動の紹介'});
  s.member('movie',101,'feature','classics',{note:'手動の掲載メモ'});
  s.relate('movie',101,'movie',102);
  s.relate('movie',101,'movie',102);
  assert.equal(s.display('movie',101).memberships.length,2);
  assert.deepEqual(JSON.parse(s.save()).records[0].relatedWorkIds,['movie:102']);
 });
 check('手動修正・確認OK後の自動上書き防止',()=>{
  s.edit('movie',101,{title:'確認済み作品名'});
  s.confirm('movie',101);
  s.automatic('movie',101,{title:'誤った自動更新',overview:'上書き'});
  assert.equal(s.display('movie',101).title,'確認済み作品名');
  assert.throws(()=>s.edit('movie',101,{title:'誤編集'}),/locked/);
 });
 check('エラー記録・手動修復・確認OK',()=>{
  const eid=s.error('tv',201,'ポスター要確認');
  assert.throws(()=>s.confirm('tv',201),/unresolved/);
  s.edit('tv',201,{posterPath:'/repaired.jpg'});
  s.resolve('tv',201,eid);s.confirm('tv',201);
  assert.equal(s.display('tv',201).confirmed,true);
 });
 check('保存・復元・詳細表示と再利用',()=>{
  const saved=s.save(),restored=store();restored.load(saved);
  assert.equal(restored.audit().count,10);
  assert.equal(restored.display('movie',101).title,'確認済み作品名');
  assert.equal(restored.display('tv',201).posterPath,'/repaired.jpg');
  assert.equal(restored.register('movie',101,{title:'再取得不要'}),false);
  assert.equal(restored.audit().duplicates,0);
  assert.equal(restored.audit().oversized.length,0);
  assert.equal(restored.errors()[0].status,'resolved');
  assert.equal(JSON.parse(restored.save()).records[0].pageExtras['feature:classics'].note,'手動の掲載メモ');
 });
 return {result:'PASS',works:s.audit().count,checks,bytes:s.audit().totalBytes,notes:'架空のサンプルIDによる作品台帳単体のオフライン検証。TMDB取得、人物・配信・シーズン台帳接続、ブラウザUI、本番Redisは未検証'};
}
if(require.main===module){try{console.log(JSON.stringify(run(),null,2))}catch(e){console.error('FAIL:',e.stack);process.exitCode=1}}
module.exports={run};
