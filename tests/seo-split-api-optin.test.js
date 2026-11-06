'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');
test('existing movie and TV detail responses remain the default',()=>{
 const optIn="req.query?.detailFormat === 'split' ? splitDetailResponse(result) : result";
 assert.equal(source.split(optIn).length-1,2);
 assert.match(source,/if \(season > 0\) \{/);
 assert.match(source,/\.json\(result\);/);
});
test('split format is computed from the same detail result, not a second request',()=>{
 const detail=source.slice(source.indexOf('// 作品詳細\n'),source.indexOf('// こだわり検索',source.indexOf('// 作品詳細\n')));
 assert.equal((detail.match(/await getMovieDetail\(/g)||[]).length,1);
 assert.equal((detail.match(/await getTvDetail\(/g)||[]).length,1);
 assert.equal((detail.match(/splitDetailResponse\(result\)/g)||[]).length,2);
});
