'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSeoRecord,renderHead,renderInitialHeading,validateSeoRecord}=require('../prototype/seo-ledger');
test('movie initial HTML includes work-specific SEO fields',()=>{
 const r=createSeoRecord({type:'movie',id:123,title:'映画テスト',releaseDate:'2020-01-01',overview:'作品の紹介',posterPath:'/abc.jpg'},{updatedAt:'2026-11-08T00:00:00Z'});
 const html=renderHead(r)+renderInitialHeading(r);
 assert.match(html,/<title>映画テスト/);
 assert.match(html,/detail.html\?id=123/);
 assert.match(html,/<h1>映画テスト<\/h1>/);
 assert.match(html,/og:image/);
});
test('TV and movie with same numeric ID have distinct canonical URLs',()=>{
 const movie=createSeoRecord({type:'movie',id:123,title:'映画'});
 const tv=createSeoRecord({type:'tv',id:123,title:'ドラマ'});
 assert.notEqual(movie.key,tv.key);
 assert.notEqual(movie.canonical,tv.canonical);
});
test('untrusted work titles are escaped in generated HTML',()=>{
 const r=createSeoRecord({type:'movie',id:3,title:'<script>alert(1)</script> & 試験'});
 const html=renderHead(r)+renderInitialHeading(r);
 assert.doesNotMatch(html,/<script>/);
 assert.match(html,/&amp;/);
});
test('invalid or empty work identity is rejected',()=>{
 assert.throws(()=>createSeoRecord({type:'movie',id:0,title:'作品'}));
 assert.throws(()=>createSeoRecord({type:'movie',id:1,title:''}));
});
test('unknown ledger fields cannot be rendered',()=>{
 const r=createSeoRecord({type:'movie',id:1,title:'作品'});
 assert.throws(()=>validateSeoRecord({...r,unexpected:'field'}));
});
