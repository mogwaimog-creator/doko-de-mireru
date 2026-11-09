'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const names=Object.keys(require('../data/watch-order-memberships.json'));
test('all 13 fixed HTML documents match the protected editorial baseline byte for byte after the streaming-only hook is removed',()=>{
 for(const name of names){const current=fs.readFileSync(name+'.html','utf8'),prior=require('../docs/ISSUE_19_EDITORIAL_PROTECTION_20261109.json').series.find(row=>row.series===name).sha256;const restored=current.replace('<script src="series-ledger-view.js" data-series="'+name+'"></script>\n','').replace(/dokoSeriesFetch(?=\([^\n;]{0,240}\/api\/series-watch\?series=)/,'fetch');assert.equal(createHash('sha256').update(restored).digest('hex'),prior,name);assert.equal((current.match(/src="series-ledger-view.js"/g)||[]).length,1);assert(!current.includes('dokoSeriesBind'))}
});
test('existing-series shared loader deduplicates streaming responses without reading or mutating fixed metadata',()=>{const source=fs.readFileSync('series-ledger-view.js','utf8');for(const pattern of [/\.works\b/,/posterPath/,/MutationObserver/,/createElement/,/querySelector/,/\.textContent\s*=/,/\.src\s*=/,/dokoSeriesBind/])assert(!pattern.test(source),String(pattern));assert(source.includes('response.clone()'));assert(!source.includes('api.themoviedb.org'))});
