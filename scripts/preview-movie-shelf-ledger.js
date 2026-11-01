'use strict';
// Read-only candidate preview. No network, database writes, or HTML edits.
const fs = require('node:fs');
const path = require('node:path');
const { extractLiteral, buildEditorialSnapshot, resolveEditorialTitleIds, audit } = require('./audit-movie-shelf');


// Research candidates only: IDs gathered from external references have not been
// verified against TMDB directly. Never treat this map as production authority.
const researchedIdCandidates = Object.freeze({
  'オール・ザット・ジャズ':16858,'アトランティック・シティ':23954,
  '歌え！ロレッタ 愛のために':16769,'ハートランド':49427,'普通の人々':16619,
  '炎のランナー':9443,'急げ、急げ':47211,'鉄の男':225,'鉛の時代':42142,
  'ガンジー':783,'ミッシング':15600,'ことの次第':30363,'トッツィー':9576,
  'ベロニカ・フォスのあこがれ':2262,'路（みち）':52556,'アセンダンシー':163143,
  'カルメンという名の女':32689,'愛と追憶の日々':11050,'蜂の巣':104435,
  '愛のイエントル':10269,'太陽の年':42096,'アマデウス':279,
  'ラヴ・ストリームス':52109,'パリ、テキサス':655,
  'ロマンシング・ストーン／秘宝の谷':9326
});

function researchPreview(html, diagnosticHtml) {
  const baseline = preview(html);
  const catalogMatch = diagnosticHtml.match(/const items=(\[[\s\S]*?\]);\s*const known=/);
  if (!catalogMatch) throw Error('Missing diagnostic catalog');
  const catalog = JSON.parse(catalogMatch[1]);
  const remaining = Object.values(baseline.coverage.retainedEntries).flat();
  const titles = [...new Set(remaining.map(entry => entry.title))];
  const ids = Object.values(researchedIdCandidates);
  if (titles.length !== ids.length || new Set(ids).size !== ids.length ||
      titles.some(title => !Number.isSafeInteger(researchedIdCandidates[title]) ||
        catalog.filter(entry => entry.title === title).length !== 1))
    throw Error('Research candidates do not match unresolved source and catalog');
  const existingIds = new Set(baseline.records.map(record => record.tmdbId));
  if (ids.some(id => existingIds.has(id))) throw Error('Research ID collides with existing ledger candidate');
  const fixed = extractLiteral(html, 'classicKnownIds');
  if (Object.entries(fixed).some(([title,id]) =>
    researchedIdCandidates[title] && researchedIdCandidates[title] !== id ||
    ids.includes(id) && researchedIdCandidates[title] !== id))
    throw Error('Research ID collides with fixed ID');
  // Do not mutate baseline or silently promote unverified research to production.
  const researchRecords = titles.map(title => ({
    key: 'movie:' + researchedIdCandidates[title], type: 'movie',
    tmdbId: researchedIdCandidates[title], title, manualReview: true,
    verificationStatus: 'external-candidate-unverified-by-tmdb',
    pageExtras: { movieShelf: Object.fromEntries(
      ['verifiedClassicInfo','approvedAwardStories']
        .filter(section => Object.hasOwn(baseline.snapshot.sources[section], title))
        .map(section => [section, structuredClone(baseline.snapshot.sources[section][title])])
    ) }
  }));
  const all = [...baseline.records, ...researchRecords];
  if (new Set(all.map(record => record.key)).size !== all.length)
    throw Error('Duplicate ledger key in research preview');
  const candidateCounts = Object.fromEntries(
    Object.keys(baseline.coverage.sourceCounts).map(section => [
      section,
      baseline.coverage.candidateCounts[section] +
        researchRecords.filter(record => Object.hasOwn(record.pageExtras.movieShelf, section)).length
    ])
  );
  const retainedEntries = Object.fromEntries(
    Object.keys(baseline.coverage.sourceCounts).map(section => [
      section,
      baseline.coverage.retainedEntries[section].filter(entry =>
        !researchRecords.some(record =>
          record.title === entry.title &&
          Object.hasOwn(record.pageExtras.movieShelf, section)))
    ])
  );
  const coverage = {
    ...baseline.coverage,
    candidateCounts,
    retainedEntries,
    retainedForReview: Object.fromEntries(
      Object.keys(retainedEntries).map(section => [section, retainedEntries[section].length]))
  };
  if (Object.keys(coverage.sourceCounts).some(section =>
    coverage.candidateCounts[section] !== coverage.sourceCounts[section]))
    throw Error('Research preview did not preserve all source entries');
  return { mode:'read-only', writes:0, baseline, researchRecords, records:all,
    coverage, verifiedByTmdb:false };
}

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
  if (existing.pageExtras != null && (typeof existing.pageExtras !== 'object' || Array.isArray(existing.pageExtras))) {
    return { action: 'blocked', record: null, conflicts: ['invalid-existing-extras'] };
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
  assert.equal(planCandidateMerge(sample, { ...existing, pageExtras: 'invalid' }).action, 'blocked');
  assert.equal(planCandidateMerge(sample, { ...existing, pageExtras: [] }).action, 'blocked');
  assert.equal(planCandidateMerge(sample, { ...existing, pageExtras: { movieShelf: [] } }).action, 'blocked');
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
    const research = researchPreview(html, fs.readFileSync(path.join(__dirname, '../shelf-check.html'), 'utf8'));
    if (research.records.length !== 66 || research.researchRecords.length !== 25 ||
        research.writes !== 0 || research.verifiedByTmdb !== false)
      throw Error('Research preview preflight failed');
    const combinedValidation = validatePreview(research);
    if (!combinedValidation.valid)
      throw Error('Combined coverage invalid: ' + combinedValidation.problems.join(', '));
    console.log('Combined 66-work coverage validated');
    // Exhaustive preflight: every original editorial entry must survive in the
    // same section and with identical content, across all 66 candidate records.
    const source = research.baseline.snapshot.sources;
    const byTitle = new Map(research.records.map(record => [record.title, record]));
    if (byTitle.size !== research.records.length) throw Error('Duplicate title across 66 works');
    const sectionCounts = {};
    for (const section of ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories']) {
      const entries = section === 'memoryFilms'
        ? source[section].map(entry => [entry.title, entry])
        : Object.entries(source[section]);
      sectionCounts[section] = entries.length;
      if (new Set(entries.map(([title]) => title)).size !== entries.length)
        throw Error('Duplicate source title in ' + section);
      for (const [title, original] of entries) {
        const saved = byTitle.get(title)?.pageExtras?.movieShelf?.[section];
        if (JSON.stringify(saved) !== JSON.stringify(original))
          throw Error('Editorial entry lost or changed: ' + section + ' / ' + title);
      }
    }
    if (research.records.some(record => !Number.isSafeInteger(record.tmdbId) ||
        record.tmdbId <= 0) ||
        new Set(research.records.map(record => record.key)).size !== research.records.length)
      throw Error('Invalid or duplicate work key in 66-work preview');
    // Static UI compatibility guard. These are the existing interactive
    // contracts; this does not claim to be a real-browser visual test.
    const uiContracts = {
      tabs: [
        "function setTab(tab)", "data-tab", "award-section",
        "rank-section", "memory-section", "renderRankings()", "renderMemories()"
      ],
      filmCards: [
        "function renderMemories()", "data-memory-id", "function openMemory(m,trigger)",
        "memory-dialog-content", "memoryEscape(m.summary)", "memoryEscape(m.memory)"
      ],
      awardAndRankingDetails: [
        "function showCommonDetails(items,kind,trigger)",
        "data-award-title", "data-ranking-title", "function classicSection("
      ],
      filtersAndPosters: [
        "data-memory-genre", "data-rank", "function loadMemoryPoster(",
        "function shelfFixedMovie(id)", "function shelfTitleSearch(query)"
      ]
    };
    for (const [feature, markers] of Object.entries(uiContracts)) {
      for (const marker of markers)
        if (!html.includes(marker))
          throw Error('Existing shelf UI contract missing: ' + feature + ' / ' + marker);
    }
    console.log('Static shelf UI contracts passed: ' +
      Object.keys(uiContracts).join(', '));
    // Simulate the planned ledger JSON round-trip and reconstruct the three
    // source sections. This does not change the live page or invoke Redis.
    const normalizedRecords = research.records.map(record => {
      const input = toLedgerCandidate(record);
      return JSON.parse(JSON.stringify(
        require('../api/_work-ledger').normalizeWork(input.type, input.id, input)
      ));
    });
    const reconstructed = {
      memoryFilms: [],
      verifiedClassicInfo: {},
      approvedAwardStories: {}
    };
    for (const record of normalizedRecords) {
      const extras = record.pageExtras.movieShelf;
      if (Object.hasOwn(extras, 'memoryFilms'))
        reconstructed.memoryFilms.push(extras.memoryFilms);
      for (const section of ['verifiedClassicInfo', 'approvedAwardStories']) {
        if (Object.hasOwn(extras, section))
          reconstructed[section][record.title] = extras[section];
      }
    }
    // Source arrays retain their original ordering, including any deliberate
    // editorial ordering that a database's key order cannot guarantee.
    const originalOrder = source.memoryFilms.map(entry => entry.title);
    const byMemoryTitle = new Map(reconstructed.memoryFilms.map(entry => [entry.title, entry]));
    reconstructed.memoryFilms = originalOrder.map(title => byMemoryTitle.get(title));
    const canonical = value => JSON.stringify(value);
    if (canonical(reconstructed.memoryFilms) !== canonical(source.memoryFilms))
      throw Error('Ledger round-trip changed memoryFilms or its order');
    for (const section of ['verifiedClassicInfo', 'approvedAwardStories']) {
      if (Object.keys(reconstructed[section]).length !== Object.keys(source[section]).length)
        throw Error('Ledger round-trip changed count: ' + section);
      for (const [title, value] of Object.entries(source[section])) {
        if (canonical(reconstructed[section][title]) !== canonical(value))
          throw Error('Ledger round-trip changed content: ' + section + ' / ' + title);
      }
    }
    // Offline card/detail data equivalence: compare every field consumed by
    // the existing memory card and detail templates, not just raw JSON blobs.
    const memoryUiFields = ['title', 'year', 'origin', 'genres', 'summary',
      'director', 'cast', 'memory', 'id'];
    const memoryUiProjection = entry => Object.fromEntries(
      memoryUiFields.map(field => [field, entry[field] ?? null]));
    for (let i = 0; i < source.memoryFilms.length; i++) {
      const before = memoryUiProjection(source.memoryFilms[i]);
      const after = memoryUiProjection(reconstructed.memoryFilms[i]);
      if (canonical(before) !== canonical(after))
        throw Error('Memory card/detail fields changed at position ' + i);
      if (!Array.isArray(after.genres) || !after.title ||
          !Number.isInteger(after.year) || !Number.isSafeInteger(after.id))
        throw Error('Memory UI requires missing or invalid fields: ' + after.title);
    }
    console.log('Memory card/detail data equivalence passed: ' +
      reconstructed.memoryFilms.length + ' cards and dialogs');
    console.log('Ledger JSON round-trip passed: 66 works, 74 editorial entries, original memory order preserved');
    console.log('Full editorial preservation passed: ' +
      JSON.stringify(sectionCounts) + ', unique works: ' + research.records.length);
    for (const record of research.researchRecords) {
      const normalized = require('../api/_work-ledger').normalizeWork('movie', record.tmdbId, toLedgerCandidate(record));
      if (JSON.stringify(normalized.pageExtras) !== JSON.stringify(record.pageExtras))
        throw Error('Research editorial content changed: ' + record.key);
    }
    console.log('Research-only candidates: ' + research.researchRecords.length +
      ', total preview records: ' + research.records.length +
      ', TMDB direct verification: pending');
    console.log('Read-only checks passed for ' + result.records.length + ' candidates');
    console.log('Source coverage: ' + JSON.stringify(result.coverage));
    console.log('Unique retained titles: ' + JSON.stringify([...new Set(Object.values(result.coverage.retainedEntries).flat().map(entry => entry.title))]));
    console.log('Review reasons: ' + JSON.stringify(result.review.reduce((counts, entry) => {
      const key = entry.reason || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
      return counts;
    }, {})));
  } else console.log(JSON.stringify(preview(html), null, 2));
}
module.exports = { preview, validatePreview, toLedgerCandidate, planCandidateMerge, checkCandidateMerge, researchPreview, researchedIdCandidates };
