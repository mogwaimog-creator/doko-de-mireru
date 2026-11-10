'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSeoRecord}=require('../prototype/seo-ledger');
const {renderDetailHtml}=require('../prototype/seo-detail-renderer');
const fs=require('node:fs');
const path=require('node:path');
const template=fs.readFileSync(path.join(__dirname,'../detail.html'),'utf8');
function render(type,id,overview){
 const record=createSeoRecord({type,id,title:type==='tv'?'テストドラマ':'テスト映画',overview,releaseDate:'2020-01-01'});
 return renderDetailHtml(template,record);
}
test('movie initial HTML includes saved synopsis and movie canonical',()=>{
 const html=render('movie',1726,'保存された映画のあらすじ');
 assert.match(html,/<div id="overview" class="side-text overview-text">保存された映画のあらすじ<\/div>/);
 assert.match(html,/detail\.html\?id=1726/);
 assert.match(html,/data-seo-ledger="1"/);
});
test('TV initial HTML includes saved synopsis and TV canonical',()=>{
 const html=render('tv',1399,'保存されたドラマのあらすじ');
 assert.match(html,/保存されたドラマのあらすじ/);
 assert.match(html,/detail\.html\?id=1399&amp;type=tv/);
});
test('synopsis is escaped, not executable HTML',()=>{
 const html=render('movie',1,'<script>alert("x")</script>');
 assert.match(html,/alert\(&quot;x&quot;\)/);
 assert.doesNotMatch(html,/&lt;script&gt;|&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<div id="overview"[^>]*><script>/);
});
test('missing synopsis does not invent content',()=>{
 const html=render('movie',2,'');
 assert.match(html,/<div\b(?=[^>]*\bid\s*=\s*"overview")[^>]*>\s*<\/div>/);
});
