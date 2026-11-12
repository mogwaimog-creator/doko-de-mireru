'use strict';
// Offline source guard for the large legacy search route.
// This checks the branch shape, not the deployed endpoint behavior.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');
const start=source.indexOf('if (season > 0) {');
assert.ok(start>=0,'season route missing');
const end=source.indexOf('const result =\n        await getTvSeason(',start);
assert.ok(end>start,'legacy season fallback missing');
const section=source.slice(start,end);
assert.match(section,/process\.env\.SEASON_LEDGER_ENABLED === "1"/);
assert.match(section,/makeSeasonSearchBranch/);
assert.match(section,/newStatus === 200/);
assert.match(section,/res\.setHeader\("Vercel-CDN-Cache-Control", "no-store"\)/);
assert.match(section,/\^\[1-9\]\\d\*\$/);
assert.ok(end>source.indexOf('SEASON_LEDGER_ENABLED',start));
console.log('season search flag and fallback source guard tests passed');
