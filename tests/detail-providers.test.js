'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { detailProviders } = require('../api/_detail-providers');

test('legacy provider route remains unchanged with feature flag off', async () => {
  const previous = process.env.SHARED_PROVIDER_ENABLED;
  delete process.env.SHARED_PROVIDER_ENABLED;
  let calls = 0;
  try {
    const result = await detailProviders('movie', 123, async () => {
      calls++;
      return { results: { JP: { flatrate: [{ provider_id: 8 }], rent: [{provider_id: 2}] } } };
    });
    assert.equal(calls, 1);
    assert.equal(result.availability.flatrate[0].provider_id, 8);
    assert.equal(result.availability.rent[0].provider_id, 2);
    assert.equal(result.stale, false);
  } finally {
    if (previous === undefined) delete process.env.SHARED_PROVIDER_ENABLED;
    else process.env.SHARED_PROVIDER_ENABLED = previous;
  }
});
