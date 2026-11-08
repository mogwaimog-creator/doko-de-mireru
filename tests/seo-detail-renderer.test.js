'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSeoRecord}=require('../prototype/seo-ledger');
const {renderDetailHtml}=require('../prototype/seo-detail-renderer');
const template=`<!doctype html><html lang="ja"><head>
<title>共通タイトル</title>
<meta name="description" content="共通説明">
<link id="canonical" rel="canonical">
<meta property="og:type" content="website">
<meta property="og:title" content="作品情報">
<meta property="og:description" content="共通説明">
<meta property="og:url" content="">
<meta property="og:image" content="">\n<meta name="twitter:title" content="共通タイトル">\n<meta name="twitter:description" content="共通説明">\n<meta name="twitter:image" content="">
</head><body><h1 id="title"></h1></body></html>`;
test('server response has unique SEO and visible H1 before JS runs',()=>{
 const record=createSeoRecord({type:'movie',id:321,title:'映画A',overview:'あらすじ',posterPath:'/abc.jpg'});
 const html=renderDetailHtml(template,record);
 assert.match(html,/<title>映画A/);
 assert.match(html,/canonical" href="https:\/\/doko-de-mireru.com\/detail.html\?id=321&amp;type=movie"/);
 assert.match(html,/<h1 id="title">映画A<\/h1>/);
 assert.match(html,/og:image" content="https:\/\/image.tmdb.org/);
 assert.doesNotMatch(html,/<title>共通タイトル/);
});
test('missing required head tags fails closed',()=>{
 const record=createSeoRecord({type:'tv',id:1,title:'ドラマ'});
 assert.throws(()=>renderDetailHtml('<html></html>',record));
 assert.throws(()=>renderDetailHtml(template.replace('<h1 id="title"></h1>',''),record),/missing title heading/);
});

test('actual detail.html template gets crawler-visible title, H1, canonical and social metadata',()=>{
 const fs=require('node:fs');
 const path=require('node:path');
 const realTemplate=fs.readFileSync(path.join(__dirname,'..','detail.html'),'utf8');
 const record=createSeoRecord({type:'tv',id:202879,title:'テストドラマ',overview:'番組の説明',posterPath:'/poster.jpg'});
 const html=renderDetailHtml(realTemplate,record);
 assert.match(html,/<title>テストドラマ/);
 assert.match(html,/<h1 id="title">テストドラマ<\/h1>/);
 assert.match(html,/rel="canonical" href="https:\/\/doko-de-mireru.com\/detail.html\?id=202879&amp;type=tv"/);
 assert.match(html,/name="twitter:title"[\\s\\S]*?content="テストドラマ/);
 assert.match(html,/property="og:image"[\\s\\S]*?content="https:\/\/image.tmdb.org/);
 assert.equal((html.match(/<h1\\b/gi)||[]).length,(realTemplate.match(/<h1\\b/gi)||[]).length);
});
