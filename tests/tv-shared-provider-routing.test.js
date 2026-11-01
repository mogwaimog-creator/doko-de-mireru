'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../api/search.js'), 'utf8');
const tvDetail = source.slice(source.indexOf('async function getTvDetail('));

test('TV detail uses shared provider bridge whenever enabled', () => {
  assert.match(tvDetail, /process\.env\.SHARED_PROVIDER_ENABLED === '1' \|\| \(ledgerEnabled && !tv\["watch\/providers"\]\)/);
  assert.match(tvDetail, /detailProviders\('tv', tvId, \(\) => fetchJson\(providerUrl\)\)/);
});

test('TV detail avoids fetching embedded providers when shared cache enabled', () => {
  assert.match(tvDetail, /process\.env\.SHARED_PROVIDER_ENABLED === '1'\s*\? "&append_to_response=credits"\s*: "&append_to_response=credits,watch\/providers"/);
});
