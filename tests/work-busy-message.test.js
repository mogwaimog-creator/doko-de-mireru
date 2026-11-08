'use strict';
// Static contract checks; no Redis/TMDB/network access.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const detail=fs.readFileSync(path.join(__dirname,'../detail.html'),'utf8');
const search=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');
test('detail page displays busy message only for the dedicated 503 code',()=>{
 assert.match(detail,/response\.status === 503/);
 assert.match(detail,/payload\.code === "WORK_METADATA_BUSY"/);
 assert.match(detail,/error && \(error\.code === "WORK_METADATA_BUSY"/);
 assert.match(detail,/showError\(/);
 assert.match(detail,/errorBox\.textContent\s*=\s*message/);
});
test('API busy response is not CDN cached and suggests retry',()=>{
 assert.match(search,/error\.code==='WORK_METADATA_BUSY'/);
 assert.match(search,/res\.status\(503\)/);
 assert.match(search,/Retry-After","5"/);
 assert.match(search,/Vercel-CDN-Cache-Control","no-store"/);
});

test('detail page explains provider refresh contention instead of generic missing data',()=>{
 assert.match(detail,/payload\.code === "DETAIL_PROVIDERS_BUSY"/);
 assert.match(detail,/error\.code === "DETAIL_PROVIDERS_BUSY"/);
 assert.match(detail,/ただいま配信情報を更新しています/);
});
test('API returns uncached retryable response for provider refresh contention',()=>{
 assert.match(search,/error\.code==='DETAIL_PROVIDERS_BUSY'/);
 assert.match(search,/code:'DETAIL_PROVIDERS_BUSY'/);
 assert.match(search,/ただいま配信情報を更新しています/);
});

test('storage outage is distinguishable from contention in the detail page',()=>{
 assert.match(detail,/payload\.code === "WORK_STORAGE_UNAVAILABLE"/);
 assert.match(detail,/payload\.code === "DETAIL_STORAGE_UNAVAILABLE"/);
 assert.match(detail,/サーバーとの通信に問題が発生している可能性があります/);
 assert.match(detail,/error\.code === "WORK_STORAGE_UNAVAILABLE"/);
 assert.match(detail,/error\.code === "DETAIL_STORAGE_UNAVAILABLE"/);
});
test('storage outage returns retryable non-cacheable response without exposing Redis details',()=>{
 assert.match(search,/error\.code==='WORK_STORAGE_UNAVAILABLE'/);
 assert.match(search,/error\.code==='DETAIL_STORAGE_UNAVAILABLE'/);
 assert.match(search,/code:'WORK_STORAGE_UNAVAILABLE'/);
 assert.match(search,/code:'DETAIL_STORAGE_UNAVAILABLE'/);
 assert.doesNotMatch(search,/json\(\{error:'Redis/);
});

test('TV detail preserves storage outage instead of reporting empty providers',()=>{
 const tvSection=search.slice(search.indexOf("const providerUrl='https://api.themoviedb.org/3/tv/"));
 assert.ok(tvSection.length>0,'TV provider code exists');
 assert.match(tvSection,/getDetailProviders\('tv',tvId/);
 assert.match(tvSection,/if\(error\?\.code==='DETAIL_PROVIDERS_BUSY'\|\|error\?\.code==='DETAIL_STORAGE_UNAVAILABLE'\)throw error;/);
 assert.match(tvSection,/tv=\{\.\.\.fixedTv,'watch\/providers':\{results:\{\}\}\}/);
});

test('TV metadata fetch excludes duplicate provider append when ledger is enabled',()=>{
 assert.match(search,/WORK_LEDGER_ENABLED==='1'\|\|require\('[^']+_shared-streaming-read'\)\.enabled\(\)\s*\? "&append_to_response=credits"\s*:\s*"&append_to_response=credits,watch\/providers"/);
 assert.match(search,/getDetailProviders\('tv',tvId/);
});
