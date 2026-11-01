'use strict';
// Read-only candidate preview. No network, database writes, or HTML edits.
const fs = require('node:fs');
const path = require('node:path');
const { extractLiteral, buildEditorialSnapshot, resolveEditorialTitleIds, audit } = require('./audit-movie-shelf');

function preview(html) {
  const snapshot = buildEditorialSnapshot(html);
  const links = resolveEditorialTitleIds(html);
  const issues = audit(html);
  const memory = snapshot.sources.memoryFilms;
  const byId = new Map();
  const review = [...links.needsReview];
  const blockedIds = new Set(issues.conflictingMemoryIds.map(item => item.id));
  const blockedTitles = new Set([...issues.overrideIdConflicts.map(item => item.title), ...issues.duplicateMemoryTitles]);
  for (const entry of memory) {
    if (!Number.isSafeInteger(entry.id) || entry.id <= 0) {
      review.push({ section: 'memoryFilms', title: entry.title, reason: 'missing-or-invalid-id' });
      continue;
    }
    if (blockedIds.has(entry.id) || blockedTitles.has(entry.title)) {
      review.push({ section: 'memoryFilms', title: entry.title, reason: 'conflicting-id' });
      continue;
    }
    const key = 'movie:' + entry.id;
    const existing = byId.get(key);
    if (existing) {
      review.push({ section: 'memoryFilms', title: entry.title, reason: 'duplicate-id' });
      continue;
    }
    byId.set(key, { key, type: 'movie', tmdbId: entry.id, title: entry.title,
      pageExtras: { movieShelf: { memoryFilms: JSON.parse(JSON.stringify(entry)) } } });
  }
  for (const section of ['verifiedClassicInfo', 'approvedAwardStories']) {
    for (const [title, value] of Object.entries(snapshot.sources[section])) {
      const id = links.resolved[section][title];
      if (!id || blockedIds.has(id) || blockedTitles.has(title)) {
        if (id && (blockedIds.has(id) || blockedTitles.has(title)))
          review.push({ section, title, reason: 'blocked-conflict', candidates: [id] });
        continue;
      }
      const key = 'movie:' + id;
      const record = byId.get(key);
      if (record && record.title !== title) {
        review.push({ section, title, reason: 'title-mismatch', candidates: [id] });
        continue;
      }
      const target = record || { key, type: 'movie', tmdbId: id, title,
        pageExtras: { movieShelf: {} } };
      target.pageExtras.movieShelf[section] = JSON.parse(JSON.stringify(value));
      byId.set(key, target);
    }
  }
  // Full source snapshot is retained, including unmatched text; nothing is discarded.
  return { mode: 'read-only', writes: 0, records: [...byId.values()].sort((a,b) => a.tmdbId-b.tmdbId),
    review, snapshot };
}

if (require.main === module) {
  const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');
  console.log(JSON.stringify(preview(html), null, 2));
}
module.exports = { preview };
