'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','detail.html'),'utf8');
test('related-series rendering currently launches one streaming request per rendered card',()=>{
 const start=html.indexOf('/* 配信情報はカード表示後に取得 */');
 assert.ok(start>=0);
 assert.match(html.slice(start,start+300),/loadSeriesStreamingStatus\(\s*streamingStatus,\s*movie\.id,\s*isTv\s*\)/);
 const fn=html.indexOf('async function loadSeriesStreamingStatus');
 assert.ok(fn>=0);
 assert.match(html.slice(fn,fn+900),/await fetch\(/);
});
test('season episode requests occur in loadSeason and are separate from related-series requests',()=>{
 const season=html.indexOf('async function loadSeason');
 const related=html.indexOf('async function loadSeriesStreamingStatus');
 assert.ok(season>=0&&related>season);
 assert.match(html.slice(season,season+1700),/await fetch\(/);
});
