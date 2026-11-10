'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');
test('movie and TV ledger-enabled provider failures never become empty availability',()=>{
 const movie=source.slice(source.indexOf('async function getMovieDetail('),source.indexOf('async function getTvDetail('));
 const tv=source.slice(source.indexOf('async function getTvDetail('));
 const guard=/if\(process\.env\.WORK_LEDGER_ENABLED==='1'\)throw error;/g;
 assert.ok((movie.match(guard)||[]).length>=1,'movie must fail closed');
 assert.ok((tv.match(guard)||[]).length>=1,'TV must fail closed');
 assert.match(movie,/providersJP = \{\};/,'legacy fallback remains');
 assert.match(tv,/results:\{\}/,'legacy fallback remains');
});
