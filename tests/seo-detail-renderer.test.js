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
