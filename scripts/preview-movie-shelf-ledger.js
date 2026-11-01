'use strict';
// Read-only candidate preview. No network, database writes, or HTML edits.
const fs = require('node:fs');
const path = require('node:path');
const { extractLiteral, buildEditorialSnapshot, resolveEditorialTitleIds, audit } = require('./audit-movie-shelf');

// Convert a preview record into the shared ledger's exact input shape.
 // This is a candidate only: never call putWork or Redis from this script.
function toLedgerCandidate(record) {
  if (!record || record.type !== 'movie' ||
      !Number.isSafeInteger(record.tmdbId) || record.tmdbId <= 0 ||
      record.key !== 'movie:' + record.tmdbId ||
      typeof record.title !== 'string' || !record.title.trim() ||
      !record.pageExtras?.movieShelf) {
    throw new Error('Invalid movie shelf candidate');
  }
  return {
    type: 'movie',
    id: record.tmdbId,
    title: record.title,
    manualReview: true,
    pageExtras: JSON.parse(JSON.stringify(record.pageExtras))
  };
}

function validatePreview(result) {
  const problems = [];
  const keys = new Set();
  for (const record of result.records) {
    if (keys.has(record.key)) problems.push('duplicate-key:' + record.key);
    keys.add(record.key);
    if (record.key !== record.type + ':' + record.tmdbId)
      problems.push('invalid-key:' + record.key);
    if (record.type !== 'movie' || !Number.isSafeInteger(record.tmdbId) || record.tmdbId <= 0)
      problems.push('invalid-identity:' + record.key);
  }
  for (const section of ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories']) {
    const coverage = result.coverage;
    if (coverage.sourceCounts[section] !== coverage.candidateCounts[section] + coverage.retainedForReview[section])
      problems.push('coverage-mismatch:' + section);
    if (coverage.retainedEntries[section].length !== coverage.retainedForReview[section])
      problems.push('retained-mismatch:' + section);
  }
  if (result.writes !== 0 || result.mode !== 'read-only') problems.push('unsafe-mode');
  return { valid: problems.length === 0, problems };
}

function preview(html) {
  const snapshot = buildEditorialSnapshot(html);
  const links = resolveEditorialTitleIds(html);
  const issues = audit(html);
  const memory = snapshot.sources.memoryFilms;
  const byId = new Map();
  const review = [...links.needsReview];
  const blockedIds = new Set(issues.conflictingMemoryIds.map(item => item.id));
  const blockedTitles = new Set([...issues.overrideIdConflicts.map(item => item.title), ...issues.duplicateMemoryTitles]);
  // Preflight all resolved editorial titles: two distinct titles must never
  // share a ledger key just because they point to the same numeric ID.
  const titlesById = new Map();
  for (const entry of memory) {
    if (!Number.isSafeInteger(entry.id) || entry.id <= 0) continue;
    if (!titlesById.has(entry.id)) titlesById.set(entry.id, new Set());
    titlesById.get(entry.id).add(entry.title);
  }
  for (const section of ['verifiedClassicInfo', 'approvedAwardStories']) {
    for (const [title, id] of Object.entries(links.resolved[section])) {
      if (!titlesById.has(id)) titlesById.set(id, new Set());
      titlesById.get(id).add(title);
    }
  }
  const ambiguousIds = new Set([...titlesById].filter(([, titles]) => titles.size > 1).map(([id]) => id));
  for (const id of ambiguousIds)
    review.push({ section: 'cross-section', title: [...titlesById.get(id)].join(' / '),
      reason: 'multiple-titles-for-id', candidates: [id] });
  for (const entry of memory) {
    if (!Number.isSafeInteger(entry.id) || entry.id <= 0) {
      review.push({ section: 'memoryFilms', title: entry.title, reason: 'missing-or-invalid-id' });
      continue;
    }
    if ((blockedIds.has(entry.id) || ambiguousIds.has(entry.id)) || blockedTitles.has(entry.title)) {
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
      if (!id || blockedIds.has(id) || ambiguousIds.has(id) || blockedTitles.has(title)) {
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
  // Prove every source entry is represented either by a candidate or by the
  // retained snapshot. A preview is not a deletion or import instruction.
  const sourceCounts = Object.fromEntries(Object.entries(snapshot.sources).map(([name, value]) =>
    [name, Array.isArray(value) ? value.length : Object.keys(value).length]));
  const candidateCounts = {
    memoryFilms: [...byId.values()].filter(item => Object.hasOwn(item.pageExtras.movieShelf, 'memoryFilms')).length,
    verifiedClassicInfo: [...byId.values()].filter(item => Object.hasOwn(item.pageExtras.movieShelf, 'verifiedClassicInfo')).length,
    approvedAwardStories: [...byId.values()].filter(item => Object.hasOwn(item.pageExtras.movieShelf, 'approvedAwardStories')).length
  };
  const retainedForReview = Object.fromEntries(Object.keys(sourceCounts).map(name =>
    [name, sourceCounts[name] - candidateCounts[name]]));
  const retainedEntries = {
    memoryFilms: memory.filter(entry => ![...byId.values()].some(item =>
      item.pageExtras.movieShelf.memoryFilms &&
      item.pageExtras.movieShelf.memoryFilms.title === entry.title &&
      item.pageExtras.movieShelf.memoryFilms.id === entry.id)).map(entry => ({
        title: entry.title, id: entry.id ?? null
      })),
    verifiedClassicInfo: Object.keys(snapshot.sources.verifiedClassicInfo).filter(title =>
      ![...byId.values()].some(item => item.title === title &&
        Object.hasOwn(item.pageExtras.movieShelf, 'verifiedClassicInfo'))).map(title => ({ title })),
    approvedAwardStories: Object.keys(snapshot.sources.approvedAwardStories).filter(title =>
      ![...byId.values()].some(item => item.title === title &&
        Object.hasOwn(item.pageExtras.movieShelf, 'approvedAwardStories'))).map(title => ({ title }))
  };
  // Full source snapshot is retained, including unmatched text; nothing is discarded.
  return { mode: 'read-only', writes: 0, records: [...byId.values()].sort((a,b) => a.tmdbId-b.tmdbId),
    review, snapshot, coverage: { sourceCounts, candidateCounts, retainedForReview, retainedEntries } };
}

if (require.main === module) {
  const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');
  console.log(JSON.stringify(preview(html), null, 2));
}
module.exports = { preview, validatePreview, toLedgerCandidate };
