'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {store,normalizePerson}=require('../prototype/person-ledger');
const person={id:1813,name:'人物サンプル',biography:'紹介文',cast:[{id:101,media_type:'movie',title:'映画A',release_date:'2022-01-02',poster_path:'/a.jpg',overview:'保存不要',providerData:{JP:{}},seasons:[1]},{id:101,media_type:'movie',title:'重複'},{id:101,media_type:'tv',name:'TV A',first_air_date:'2021-08-09'}]};
test('compact work cards contain exactly five fields',()=>{
 const s=store();s.success(person,'2026-11-01T00:00:00Z');s.success({...person,name:'更新後'},'2026-11-02T00:00:00Z');
 assert.equal(s.count(),1);const c=s.get(1813).person.cast;
 assert.equal(c.length,2);assert.deepEqual(c[0],{id:101,media_type:'movie',title:'映画A',year:'2022',poster_path:'/a.jpg'});
 assert.deepEqual(c[1],{id:101,media_type:'tv',title:'TV A',year:'2021',poster_path:null});
});
test('old person ledger card shape with content_type and release_date',()=>{
 const p=normalizePerson({id:1813,name:'sample',cast:[{id:201,title:'old movie',release_date:'2019-12-12',content_type:'movie',poster_path:'/x.jpg',release_status:'released',display_type:'cast',appearance_type:'actor',character:'x',order:1}],voice:[{id:202,title:'old TV',release_date:'2020-01-01',content_type:'tv'}]});
 assert.deepEqual(p.cast[0],{id:201,media_type:'movie',title:'old movie',year:'2019',poster_path:'/x.jpg'});
 assert.equal(p.voice[0].year,'2020');
});
test('missing dates and malformed dates do not create bogus years',()=>{
 const p=normalizePerson({id:1,cast:[{id:1,media_type:'movie',title:'a',release_date:'unknown'},{id:2,media_type:'tv',name:'b',first_air_date:'2021-02-03',release_date:'2018-01-01'}]});
 assert.equal(p.cast[0].year,null);assert.equal(p.cast[1].year,'2021');
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
 assert.deepEqual(restored.get(1813).person.cast,s.get(1813).person.cast);
 const raw=JSON.parse(s.save());raw.records.push(raw.records[0]);
 assert.throws(()=>restored.load(JSON.stringify(raw)),/duplicate/);
 assert.equal(restored.count(),1);
});

test('first saved date persists across refresh and restore',()=>{
 const s=store();s.success(person,'2026-11-01T00:00:00Z');
 s.success({...person,name:'changed'},'2027-01-02T00:00:00Z');
 assert.equal(s.get(1813).createdAt,'2026-11-01T00:00:00.000Z');
 assert.equal(s.get(1813).checkedAt,'2027-01-02T00:00:00.000Z');
 assert.equal(s.get(1813).schemaVersion,2);
 const restored=store();restored.load(s.save());
 assert.equal(restored.get(1813).createdAt,'2026-11-01T00:00:00.000Z');
});
test('old version 1 snapshots can be loaded without extra work-card fields',()=>{
 const s=store();s.success(person,'2026-11-01T00:00:00Z');
 const old=JSON.parse(s.save());old.version=1;delete old.records[0].createdAt;
 const restored=store();restored.load(JSON.stringify(old));
 assert.equal(restored.get(1813).createdAt,'2026-11-01T00:00:00.000Z');
 assert.deepEqual(Object.keys(restored.get(1813).person.cast[0]),['id','media_type','title','year','poster_path']);
});

test('strict stored schema rejects unknown fields at every level',()=>{
 const {validateRecord}=require('../prototype/person-ledger');
 const s=store();s.success(person,'2026-11-01T00:00:00Z');
 const record=JSON.parse(JSON.stringify(s.get(1813)));
 validateRecord(record);
 record.person.cast[0].unused='must not persist';
 assert.throws(()=>validateRecord(record),/unexpected or missing fields/);
 delete record.person.cast[0].unused;
 record.person.unknownProfile='no';
 assert.throws(()=>validateRecord(record),/unexpected or missing fields/);
 delete record.person.unknownProfile;
 record.unknownRecord='no';
 assert.throws(()=>validateRecord(record),/unexpected or missing fields/);
});
test('unknown source fields are ignored, never saved',()=>{
 const s=store();s.success({...person,unknownProfile:{x:1},cast:[{...person.cast[0],unused:'no'}]},'2026-11-01T00:00:00Z');
 assert.equal(s.save().includes('unknownProfile'),false);
 assert.equal(s.save().includes('unused'),false);
});
