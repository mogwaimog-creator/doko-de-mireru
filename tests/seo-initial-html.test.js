'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {workSeo,personSeo,injectSeo}=require('../api/_seo-initial-html');
const template=`<html><head><title>generic</title><meta name="description" content="generic"><link id="canonical" rel="canonical"><meta id="ogTitle" property="og:title" content="generic"><meta id="ogDescription" property="og:description" content="generic"><meta id="ogUrl" property="og:url" content=""></head><body>Keep page body</body></html>`;
test('movie metadata is URL-specific',()=>{
 const html=injectSeo(template,'work',{type:'movie',id:77,title:'映画A'});
 assert.match(html,/detail\.html\?id=77/);
 assert.match(html,/<title>映画Aはどこで見れる/);
 assert.match(html,/Keep page body/);
});
test('TV metadata preserves type in canonical',()=>{
 const html=injectSeo(template,'work',{type:'tv',id:123,title:'ドラマA'});
 assert.match(html,/detail\.html\?id=123&amp;type=tv/);
});
test('person metadata is URL-specific',()=>{
 const html=injectSeo(template,'person',{id:42,name:'俳優A'});
 assert.match(html,/person\.html\?id=42/);
 assert.match(html,/俳優Aの映画・出演作品一覧/);
});
test('HTML is escaped',()=>{
 const html=injectSeo(template,'work',{type:'movie',id:5,title:'A <B> & "C"'});
 assert.match(html,/A &lt;B&gt; &amp; &quot;C&quot;/);
});
test('invalid ids are rejected',()=>{
 assert.throws(()=>workSeo({type:'movie',id:'../1',title:'bad'}));
 assert.throws(()=>personSeo({id:0,name:'bad'}));
});
test('missing SEO tags fail closed',()=>{
 assert.throws(()=>injectSeo('<html><title>only</title></html>','person',{id:1,name:'A'}));
});
