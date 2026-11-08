'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/person-ledger');
const person={id:1813,name:'人物サンプル',biography:'紹介文',cast:[{id:101,media_type:'movie',title:'映画A',poster_path:'/a.jpg',overview:'保存不要',providerData:{JP:{}},seasons:[1]},{id:101,media_type:'movie',title:'重複'},{id:101,media_type:'tv',name:'TV A'}]};
test('one record per person and compact work references without streaming or detail',()=>{
 const s=store();s.success(person,'2026-11-01T00:00:00Z');s.success({...person,name:'更新後'},'2026-11-02T00:00:00Z');
 assert.equal(s.count(),1);const c=s.get(1813).person.cast;
 assert.equal(c.length,2);assert.equal(c[0].title,'映画A');
 assert.equal(c[0].overview,undefined);assert.equal(c[0].providerData,undefined);assert.equal(c[0].seasons,undefined);
 assert.equal(c[1].media_type,'tv');
});
test('60 day refresh schedule and failure preserving previous data',()=>{
 const s=store();s.success(person,'2026-09-01T00:00:00Z');
 assert.equal(s.eligible(1813,'2026-09-30T00:00:00Z'),false);
 assert.equal(s.eligible(1813,'2026-10-31T00:00:00Z'),true);
 const before=s.save();assert.equal(s.failure(1813).person.name,'人物サンプル');assert.equal(s.save(),before);
});
test('snapshot reload and duplicate detection',()=>{
 const s=store();s.success(person,'2026-11-01T00:00:00Z');
 const restored=store();restored.load(s.save());assert.equal(restored.count(),1);
 assert.equal(restored.get(1813).person.cast.length,2);
 const raw=JSON.parse(s.save());raw.records.push(raw.records[0]);
 assert.throws(()=>restored.load(JSON.stringify(raw)),/duplicate/);
 assert.equal(restored.count(),1);
});
