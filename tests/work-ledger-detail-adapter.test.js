'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {store}=require('../prototype/work-ledger');
const {detailFromWork}=require('../prototype/work-ledger-detail-adapter');
test('10 works: detail conversion reads saved data without mutating or refetching',()=>{
 const s=store();for(let i=1;i<=10;i++)s.register(i<=6?'movie':'tv',i,{title:'作品'+i,posterPath:'/p'+i+'.jpg',overview:'紹介'+i,seasonCount:99,providers:['ignored']});
 s.relate('movie',1,'movie',2);s.member('movie',1,'feature','classics',{note:'固定文章'});
 s.edit('movie',1,{title:'手動確認した作品'});s.confirm('movie',1);
 const saved=s.save();const raw=JSON.parse(saved);
 for(let i=1;i<=10;i++){const type=i<=6?'movie':'tv';const detail=detailFromWork(raw,type,i);assert.equal(detail.id,i);assert.equal(detail.type,type);assert.equal(detail.posterPath,'/p'+i+'.jpg');assert.equal(detail.seasons,undefined);assert.equal(detail.providers,undefined)}
 const d=detailFromWork(raw,'movie',1);assert.equal(d.title,'手動確認した作品');assert.deepEqual(d.relatedWorkIds,['movie:2']);assert.equal(d.confirmed,true);
 assert.equal(detailFromWork(raw,'movie',999),null);
 assert.equal(s.save(),saved);
});
