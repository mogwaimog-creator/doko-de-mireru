'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'..','detail.html'),'utf8');
test('related cards prefer available shared streaming and retain fallback for unknown records',()=>{
 assert.match(source,/if\(Array\.isArray\(sharedStreaming\)\)\s*\{\s*renderSeriesStreamingProviders\(streamingStatus, sharedStreaming\);\s*\}else if\(managed\)\{[\s\S]*?\}else\{\s*loadSeriesStreamingStatus\(streamingStatus, movie\.id, isTv\);/);
 assert.match(source,/\(isTv \? "tv:" : "movie:"\) \+ movie\.id/);
});
test('confirmed empty streaming renders no providers without a new request',()=>{
 assert.match(source,/function renderSeriesStreamingProviders\(element, values\)/);
 assert.match(source,/if\(streaming\.length === 0\)/);
 assert.match(source,/element\.textContent = "配信情報なし"/);
});
