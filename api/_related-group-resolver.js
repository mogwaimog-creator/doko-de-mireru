'use strict';
// Offline-only shared related-work group: one ordered list of type+TMDB IDs.
// Does not modify work records, call external APIs, or access Redis.
const { resolveRelatedWorks } = require('./_related-work-resolver');
function resolveRelatedGroup(group, records) {
  if (!group || typeof group !== 'object' || !Array.isArray(group.members)) {
    throw new Error('Invalid related group');
  }
  return resolveRelatedWorks(group.members, records);
}
module.exports = { resolveRelatedGroup };
