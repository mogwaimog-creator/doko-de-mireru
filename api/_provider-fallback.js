'use strict';
// Presentation policy only. Never turn a failed provider lookup into "no providers".
// lastSuccessfulAt is supplied by the caller's saved provider cache.
function providerResult({ fresh, saved, lastSuccessfulAt } = {}) {
  if (fresh && typeof fresh === 'object' && !Array.isArray(fresh)) {
    return { availability: fresh, stale: false, unavailable: false, warning: null, lastSuccessfulAt: null };
  }
  const hasSaved = saved && typeof saved === 'object' && !Array.isArray(saved);
  const timestamp = typeof lastSuccessfulAt === 'string' && !Number.isNaN(Date.parse(lastSuccessfulAt))
    ? lastSuccessfulAt : null;
  if (hasSaved) {
    return {
      availability: saved, stale: true, unavailable: false,
      warning: '最新の配信情報を確認できません。前回確認した情報を表示しています。',
      lastSuccessfulAt: timestamp
    };
  }
  return {
    availability: null, stale: false, unavailable: true,
    warning: '現在、配信情報を確認できません。',
    lastSuccessfulAt: null
  };
}
module.exports = { providerResult };
