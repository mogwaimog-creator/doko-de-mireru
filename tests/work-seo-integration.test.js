'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/work-ledger');
const {createSeoRecord,validateSeoRecord}=require('../prototype/seo-ledger');
const {renderDetailHtml}=require('../prototype/seo-detail-renderer');
const fs=require('node:fs');
const path=require('node:path');
const template=fs.readFileSync(path.join(__dirname,'..','detail.html'),'utf8');
test('work ledger to SEO ledger to real detail HTML: movie and TV with identical numeric IDs',()=>{
 const works=store();
 assert.equal(works.register('movie',123,{title:'映画A',releaseDate:'2024-01-01',posterPath:'/a.jpg',overview:'映画の紹介'}),true);
 assert.equal(works.register('tv',123,{title:'ドラマB',releaseDate:'2025-02-02',posterPath:'/b.jpg',overview:'ドラマの紹介'}),true);
 works.confirm('movie',123);
 works.confirm('tv',123);
 const movie=createSeoRecord(works.display('movie',123),{updatedAt:'2026-11-08T00:00:00Z'});
 const tv=createSeoRecord(works.display('tv',123),{updatedAt:'2026-11-08T00:00:00Z'});
 validateSeoRecord(movie);validateSeoRecord(tv);
 assert.notEqual(movie.key,tv.key);
 assert.notEqual(movie.canonical,tv.canonical);
 for(const [record,expected] of [[movie,'映画A'],[tv,'ドラマB']]){
  const html=renderDetailHtml(template,record);
  assert.ok(html.includes('<h1 id="title">'+expected+'</h1>'));
  assert.ok(html.includes('<title>'+expected));
  assert.ok(html.includes('href="'+record.canonical.replace(/&/g,'&amp;')+'"'));
  assert.ok(html.includes('content="'+record.ogImage+'"'));
 }
 assert.equal(works.audit().duplicates,0);
});
test('manual confirmation keeps fixed work metadata stable for SEO generation',()=>{
 const works=store();
 works.register('movie',900,{title:'確定タイトル',releaseDate:'2020-01-01'});
 works.confirm('movie',900);
 works.automatic('movie',900,{title:'自動上書き',releaseDate:'2030-01-01'});
 const seo=createSeoRecord(works.display('movie',900));
 assert.equal(seo.h1,'確定タイトル');
 assert.match(seo.title,/2020年/);
 assert.doesNotMatch(seo.title,/2030年/);
});
