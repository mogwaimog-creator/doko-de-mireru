'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','detail.html'),'utf8');
test('related cards use shared hits; managed misses never launch legacy provider requests',()=>{
 assert.match(html,/if\(Array\.isArray\(sharedStreaming\)\)/);
 assert.match(html,/else if\(managed\)\{[\s\S]*?配信情報は未取得、または更新待ちです[\s\S]*?\}else\{\s*loadSeriesStreamingStatus/);
 assert.match(html,/movie\.seriesStreamingManaged/);
});
test('season episode requests occur in loadSeason and are separate from related-series requests',()=>{
 const season=html.indexOf('async function loadSeason');
 const related=html.indexOf('async function loadSeriesStreamingStatus');
 assert.ok(season>=0&&related>season);
 assert.match(html.slice(season,season+1700),/await fetch\(/);
});
