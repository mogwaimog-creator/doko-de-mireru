'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { providerResult } = require('../api/_provider-fallback');
test('fresh empty result is a confirmed empty result', () => {
  const r = providerResult({ fresh: {} });
  assert.deepEqual(r.availability, {});
  assert.equal(r.warning, null);
});
test('failed fetch with saved data displays stale warning and timestamp', () => {
  const saved = { flatrate: [{ provider_id: 8 }] };
  const r = providerResult({ saved, lastSuccessfulAt: '2026-10-31T09:00:00Z' });
  assert.equal(r.availability, saved);
  assert.equal(r.stale, true);
  assert.equal(r.lastSuccessfulAt, '2026-10-31T09:00:00Z');
  assert.match(r.warning, /前回確認/);
});
test('failed fetch without saved data is unknown, not confirmed unavailable', () => {
  const r = providerResult();
  assert.equal(r.availability, null);
  assert.equal(r.unavailable, true);
  assert.match(r.warning, /確認できません/);
});
test('fresh data supersedes stale saved data', () => {
  const fresh = { rent: [{ provider_id: 2 }] };
  const r = providerResult({ fresh, saved: { flatrate: [] } });
  assert.equal(r.availability, fresh);
  assert.equal(r.stale, false);
});
