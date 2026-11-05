'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {seoKey,compactSeo}=require('../api/_seo-ledger-record');

test('SEO key is unique by media type and ID',()=>{
 assert.equal(seoKey('work','movie',42),'doko:seo:v1:movie:42');
 assert.equal(seoKey('work','tv',42),'doko:seo:v1:tv:42');
 assert.equal(seoKey('person',null,42),'doko:seo:v1:person:42');
});
test('same record produces same compact SEO entry without duplicating work metadata',()=>{
 const work={id:42,type:'movie',title:'作品 & テスト',overview:'Long original overview',cast:[{name:'Cast'}]};
 const a=compactSeo('work',work);
 assert.deepEqual(a,compactSeo('work',work));
 assert.equal(a.key,'doko:seo:v1:movie:42');
 const stored=JSON.parse(a.value);
 assert.deepEqual(Object.keys(stored),['v','t','d']);
 assert.equal(stored.v,1);
 assert.match(stored.t,/作品 & テスト/);
 assert.ok(!a.value.includes('Long original overview'));
 assert.ok(!a.value.includes('Cast'));
});
test('reject invalid kinds and identifiers',()=>{
 assert.throws(()=>seoKey('work','movie','42x'));
 assert.throws(()=>seoKey('work','movie',0));
 assert.throws(()=>seoKey('work','person',42));
 assert.throws(()=>seoKey('person','movie',42));
 assert.throws(()=>compactSeo('person',{id:1,name:''}));
});
