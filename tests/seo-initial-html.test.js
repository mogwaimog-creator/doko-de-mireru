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

const fs=require('node:fs');
const path=require('node:path');
for(const [file,kind,record] of [
  ['detail.html','work',{type:'movie',id:50014,title:'実際の作品'}],
  ['person.html','person',{id:1134684,name:'実際の人物'}]
]){
 test('real page template: '+file,()=>{
   const original=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
   const rendered=injectSeo(original,kind,record);
   assert.match(rendered,/実際の(作品|人物)/);
   assert.match(rendered,/<meta id="ogUrl" property="og:url"/);
   assert.equal((rendered.match(/<title>/g)||[]).length,1);
   assert.equal((rendered.match(/rel="canonical"/g)||[]).length,1);
   assert.ok(rendered.includes('<body'));
 });
}

test('movie and TV canonical URLs differ for same ID',()=>{
 const movie=workSeo({type:'movie',id:77,title:'Example'});
 const tv=workSeo({type:'tv',id:77,title:'Example'});
 assert.notEqual(movie.url,tv.url);
 assert.equal(tv.url,'https://doko-de-mireru.com/detail.html?id=77&type=tv');
});
test('person and movie canonical URLs differ for same ID',()=>{
 assert.notEqual(personSeo({id:77,name:'Example'}).url,workSeo({type:'movie',id:77,title:'Example'}).url);
});
test('duplicate canonical and description tags are rejected',()=>{
 assert.throws(()=>injectSeo(template.replace('</head>','<link rel="canonical"></head>'),'work',{type:'movie',id:1,title:'Example'}));
 assert.throws(()=>injectSeo(template.replace('</head>','<meta name="description" content="extra"></head>'),'person',{id:1,name:'Example'}));
});

test('real detail page includes escaped initial title and overview',()=>{
 const original=fs.readFileSync(path.join(__dirname,'..','detail.html'),'utf8');
 const html=injectSeo(original,'work',{type:'movie',id:77,title:'A <B>',overview:'物語 & 背景'});
 assert.ok(html.includes('A &lt;B&gt;'));
 assert.ok(html.includes('物語 &amp; 背景'));
});
test('real person page includes initial name and biography',()=>{
 const original=fs.readFileSync(path.join(__dirname,'..','person.html'),'utf8');
 const html=injectSeo(original,'person',{id:42,name:'俳優A',biography:'人物紹介 & 略歴'});
 assert.ok(html.includes('>俳優A</h1>'));
 assert.ok(html.includes('>人物紹介 &amp; 略歴</p>'));
});
