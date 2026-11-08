'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createSeoRecord}=require('../prototype/seo-ledger');
const {renderDetailHtml}=require('../prototype/seo-detail-renderer');
const template=fs.readFileSync(path.join(__dirname,'..','detail.html'),'utf8');
function fetchCount(s){return (s.match(/\bfetch\s*\(/g)||[]).length;}
test('server SEO HTML retains legacy detail fetch count without adding requests',()=>{
 const record=createSeoRecord({type:'movie',id:100,title:'検証映画'});
 const html=renderDetailHtml(template,record);
 assert.equal(fetchCount(html),fetchCount(template));
 assert.equal(fetchCount(html),3);
 assert.match(html,/<html\s+data-seo-ledger="1"\s+lang="ja">/);
});
test('SEO marker is limited to server-rendered output and existing client guards it',()=>{
 const record=createSeoRecord({type:'tv',id:100,title:'検証ドラマ'});
 const html=renderDetailHtml(template,record);
 assert.doesNotMatch(template,/<html[^>]*data-seo-ledger="1"/);
 assert.match(html,/<html[^>]*data-seo-ledger="1"/);
 assert.match(template,/const hasServerSeo\s*=\s*document\.documentElement\.getAttribute\("data-seo-ledger"\)\s*===\s*"1"/);
 assert.match(template,/function updateSeo\(movie\)\s*\{\s*if\(hasServerSeo\)return;/);
 assert.match(template,/if\(canonical && !hasServerSeo\)/);
 assert.match(template,/if\(!hasServerSeo\)\s*\{\s*setMetaProperty\(\s*"ogUrl"/);
});
test('server-rendered movie and TV canonical URLs follow existing client URL rules',()=>{
 const movie=createSeoRecord({type:'movie',id:100,title:'映画'});
 const tv=createSeoRecord({type:'tv',id:100,title:'ドラマ'});
 assert.equal(movie.canonical,'https://doko-de-mireru.com/detail.html?id=100');
 assert.equal(tv.canonical,'https://doko-de-mireru.com/detail.html?id=100&type=tv');
 assert.match(renderDetailHtml(template,movie),/href="https:\/\/doko-de-mireru\.com\/detail\.html\?id=100"/);
 assert.match(renderDetailHtml(template,tv),/href="https:\/\/doko-de-mireru\.com\/detail\.html\?id=100&amp;type=tv"/);
});
