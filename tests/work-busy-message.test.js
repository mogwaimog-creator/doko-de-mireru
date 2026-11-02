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
 assert.match(detail,/error && error\.code === "WORK_METADATA_BUSY"/);
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
