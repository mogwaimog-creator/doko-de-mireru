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


// Read-only merge planner: never replace existing shared metadata or editorial
// additions. Conflicting editorial values require a human decision.
function planCandidateMerge(candidate, existing) {
  const incoming = toLedgerCandidate(candidate);
  if (existing == null) return { action: 'create-candidate', record: incoming, conflicts: [] };
  if (existing.type !== incoming.type || existing.id !== incoming.id ||
      typeof existing.title !== 'string' || !existing.title.trim()) {
    return { action: 'blocked', record: null, conflicts: ['identity-or-existing-record'] };
  }
  if (existing.title !== incoming.title) {
    return { action: 'blocked', record: null, conflicts: ['title-mismatch'] };
  }
  if (existing.pageExtras?.movieShelf != null && (typeof existing.pageExtras.movieShelf !== 'object' || Array.isArray(existing.pageExtras.movieShelf))) {
    return { action: 'blocked', record: null, conflicts: ['invalid-existing-extras'] };
  }
  const currentExtras = existing.pageExtras?.movieShelf || {};
  const nextExtras = incoming.pageExtras.movieShelf;
  const conflicts = Object.keys(nextExtras).filter(key =>
    Object.hasOwn(currentExtras, key) &&
    JSON.stringify(currentExtras[key]) !== JSON.stringify(nextExtras[key]));
  if (conflicts.length) return { action: 'review-required', record: null, conflicts };
  // Preserve all existing shared fields and all other pages' additions.
  const record = JSON.parse(JSON.stringify(existing));
  record.pageExtras = record.pageExtras || {};
  record.pageExtras.movieShelf = { ...currentExtras, ...nextExtras };
  return { action: 'merge-candidate', record, conflicts: [] };
}

// Local assertion suite for the import boundary; no network or Redis writes.
// Run with: node scripts/preview-movie-shelf-ledger.js --check
function checkCandidateMerge() {
  const assert = require('node:assert/strict');
  const { normalizeWork } = require('../api/_work-ledger');
  const sample = { key: 'movie:42', type: 'movie', tmdbId: 42,
    title: '作品', pageExtras: { movieShelf: { memoryFilms: { title: '作品', id: 42, intro: '本文' } } } };
  const fresh = planCandidateMerge(sample, null);
  assert.equal(fresh.action, 'create-candidate');
  assert.deepEqual(normalizeWork('movie', 42, fresh.record).pageExtras, sample.pageExtras);
  const existing = normalizeWork('movie', 42, { title: '作品', overview: '共通説明',
    pageExtras: { otherPage: { notes: '保持' }, movieShelf: { awards: '既存賞' } } });
  const before = structuredClone(existing);
  const merged = planCandidateMerge(sample, existing);
  assert.equal(merged.action, 'merge-candidate');
  assert.equal(merged.record.overview, '共通説明');
  assert.equal(merged.record.pageExtras.otherPage.notes, '保持');
  assert.equal(merged.record.pageExtras.movieShelf.awards, '既存賞');
  assert.equal(merged.record.pageExtras.movieShelf.memoryFilms.intro, '本文');
  assert.deepEqual(existing, before);
  const conflict = planCandidateMerge(sample, { ...existing, pageExtras: {
    movieShelf: { memoryFilms: { title: '作品', id: 42, intro: '人が修正した本文' } } } });
  assert.equal(conflict.action, 'review-required');
  assert.equal(conflict.record, null);
  assert.deepEqual(conflict.conflicts, ['memoryFilms']);
  assert.equal(planCandidateMerge(sample, { ...existing, title: '別作品' }).action, 'blocked');
  assert.equal(planCandidateMerge(sample, { ...existing, pageExtras: { movieShelf: 'invalid' } }).action, 'blocked');
  assert.throws(() => planCandidateMerge({ ...sample, key: 'movie:99' }, existing));
  return true;
}

if (require.main === module) {
  const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');
  if (process.argv.includes('--check')) {
    checkCandidateMerge();
    const result = preview(html);
    if (!validatePreview(result).valid) throw new Error('Preview validation failed');
    for (const candidate of result.records) {
      const incoming = toLedgerCandidate(candidate);
      const normalized = require('../api/_work-ledger').normalizeWork(incoming.type, incoming.id, incoming);
      if (JSON.stringify(normalized.pageExtras) !== JSON.stringify(candidate.pageExtras))
        throw new Error('Editorial content changed for ' + candidate.key);
    }
    console.log('Read-only checks passed for ' + result.records.length + ' candidates');
    console.log('Source coverage: ' + JSON.stringify(result.coverage));
    console.log('Review reasons: ' + JSON.stringify(result.review.reduce((counts, entry) => {
      const key = entry.reason || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})));
  } else console.log(JSON.stringify(preview(html), null, 2));
}
module.exports = { preview, validatePreview, toLedgerCandidate, planCandidateMerge, checkCandidateMerge };
