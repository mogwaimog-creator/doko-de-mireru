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

test('TV and anime use the same opt-in provider bridge without losing rental data', async () => {
  const Module = require('node:module');
  const bridgePath = require.resolve('../api/_detail-providers');
  const originalLoad = Module._load;
  const previous = process.env.SHARED_PROVIDER_ENABLED;
  const calls = [];
  Module._load = function(request, parent, isMain) {
    if (request === './_shared-providers' && parent?.filename === bridgePath) {
      return { getSharedProviders: async (type, id, loader) => {
        calls.push({type, id});
        return {availability: await loader(), source:'tmdb', stale:false};
      }};
    }
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[bridgePath];
  try {
    const {detailProviders: bridged} = require('../api/_detail-providers');
    process.env.SHARED_PROVIDER_ENABLED = '1';
    const result = await bridged('tv', 456, async () => ({
      results: {JP: {flatrate:[{provider_id:8}], rent:[{provider_id:2}], buy:[{provider_id:3}]}}
    }));
    assert.deepEqual(calls, [{type:'tv',id:456}]);
    assert.equal(result.availability.flatrate[0].provider_id,8);
    assert.equal(result.availability.rent[0].provider_id,2);
    assert.equal(result.availability.buy[0].provider_id,3);
  } finally {
    Module._load = originalLoad;
    delete require.cache[bridgePath];
    if (previous === undefined) delete process.env.SHARED_PROVIDER_ENABLED;
    else process.env.SHARED_PROVIDER_ENABLED = previous;
  }
});
