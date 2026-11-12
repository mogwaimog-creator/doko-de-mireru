'use strict';
// Offline static regression guard for legacy search routing.
// Intentionally avoids importing api/search.js (which has external dependencies).
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');
const start=source.indexOf('module.exports = async function handler(req, res)');
const end=source.indexOf('const result =\n        await getTvSeason(',start);
assert.ok(start>=0&&end>start,'legacy season branch not found');
const routing=source.slice(start,end);
const personSearch=routing.indexOf('if (\n  personSearch\n)');
const personDetail=routing.indexOf('if (\n  personId\n)');
const detail=routing.indexOf('if (id)');
const season=routing.indexOf('if (season > 0)');
assert.ok(personSearch>=0&&personDetail>personSearch&&detail>personDetail&&season>detail,
 'person routes must remain ahead of work and season detail');
assert.match(routing,/if \(process\.env\.SEASON_LEDGER_ENABLED === "1"\)/);
assert.match(routing,/optionalSeasonRefreshRecord\(\)/);
assert.match(routing,/makeSeasonSearchBranch\(\{ fetchJson, apiKey,/);
assert.match(routing,/if \(newStatus === 200\) return res\.status\(200\)\.json\(newBody\)/);
assert.match(routing,/res\.setHeader\("Vercel-CDN-Cache-Control", "no-store"\)/);
assert.match(routing,/if \(req\.method !== "GET"\)/);
assert.match(routing,/const query =/);
assert.match(routing,/const personSearch =/);
assert.match(routing,/const personId =/);
assert.match(routing,/const id =/);
assert.match(routing,/const type =/);
assert.match(routing,/const season =/);
console.log('search/person/detail/season routing static regression tests passed');
