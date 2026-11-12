'use strict';
// Pure ID-only related-work resolver. No Redis/TMDB calls or writes.
// Caller supplies already-loaded work records; missing IDs are reported, not fetched.
function resolveRelatedWorks(links, records) {
  if (!Array.isArray(links) || !Array.isArray(records)) throw new Error('Invalid related-work input');
  const byKey = new Map();
  for (const record of records) {
    if (record && ['movie', 'tv'].includes(record.type) &&
        Number.isSafeInteger(record.id) && record.id > 0) {
      byKey.set(record.type + ':' + record.id, record);
    }
  }
  const seen = new Set();
  const works = [];
  const missing = [];
  for (const link of links) {
    if (!link || !['movie', 'tv'].includes(link.type) ||
        !Number.isSafeInteger(link.id) || link.id <= 0) {
      throw new Error('Invalid related-work ID');
    }
    const key = link.type + ':' + link.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const record = byKey.get(key);
    if (record) works.push(record);
    else missing.push({ type: link.type, id: link.id });
  }
  return { works, missing };
}
module.exports = { resolveRelatedWorks };
