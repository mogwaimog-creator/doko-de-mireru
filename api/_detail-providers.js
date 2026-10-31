'use strict';
// Opt-in bridge from legacy TMDB watch/providers payloads to shared cache.
// Existing routes keep their original behavior unless explicitly enabled.
const { getSharedProviders } = require('./_shared-providers');

async function detailProviders(type, id, load) {
  if (process.env.SHARED_PROVIDER_ENABLED !== '1') {
    const raw = await load();
    return { availability: raw?.results?.JP || {}, warning: null, stale: false, unavailable: false };
  }
  return getSharedProviders(type, id, async () => {
    const raw = await load();
    if (!raw || !raw.results || typeof raw.results !== 'object') {
      throw new Error('Invalid TMDB provider response');
    }
    // Missing JP is a confirmed empty Japanese catalog, but malformed JP is not.
    const jp = raw.results.JP;
    if (jp == null) return {};
    if (typeof jp !== 'object' || Array.isArray(jp)) {
      throw new Error('Invalid Japanese provider response');
    }
    return jp;
  });
}
module.exports = { detailProviders };
