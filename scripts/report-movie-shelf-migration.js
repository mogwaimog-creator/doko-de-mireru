'use strict';
// Local, read-only review report. No network requests, Redis writes or HTML changes.
// Run: node scripts/report-movie-shelf-migration.js
const fs = require('node:fs');
const path = require('node:path');
const { audit, buildEditorialSnapshot, resolveEditorialTitleIds } = require('./audit-movie-shelf');

function formatReviewQueue(result) {
  const labels = {
    'id-conflict': 'ID衝突',
    'invalid-id': '無効ID',
    'duplicate-title': '作品名重複',
    'missing-id': 'ID未登録',
    'editorial-id-review': '文章のID要確認'
  };
  const queue = reviewQueue(result);
  if (!queue.length) return '確認待ちの作品はありません。';
  return queue.map((entry, index) => {
    const detail = entry.section ? ' [' + entry.section + ']' : '';
    return (index + 1) + '. ' + labels[entry.kind] + ': ' + entry.title + detail;
  }).join('\n');
}

function reviewQueue(result) {
  const items = [];
  for (const conflict of result.fixedIdConflicts)
    items.push({ kind: 'id-conflict', title: conflict.titles.join(' / '), detail: String(conflict.id) });
  for (const title of result.invalidMemoryIds)
    items.push({ kind: 'invalid-id', title });
  for (const title of result.duplicateMemoryTitles)
    items.push({ kind: 'duplicate-title', title });
  for (const title of result.missingMemoryIds)
    items.push({ kind: 'missing-id', title });
  for (const entry of result.editorialIdReview)
    items.push({ kind: 'editorial-id-review', title: entry.title, section: entry.section, detail: entry.reason });
  return items.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title, 'ja'));
}

function formatReviewSummary(result) {
  const counts = result.readiness.counts;
  return [
    '名作映画の棚：台帳移行前チェック（読み取り専用）',
    '作品紹介: ' + result.sourceSections.memoryFilms + '件',
    '作品情報の補足: ' + result.sourceSections.verifiedClassicInfo + '件',
    '映画賞の補足: ' + result.sourceSections.approvedAwardStories + '件',
    'ID衝突: ' + counts.idConflicts + '件',
    '無効ID: ' + counts.invalidIds + '件',
    '作品名重複: ' + counts.duplicateTitles + '件',
    '作品紹介のID未登録: ' + counts.missingIds + '件',
    '文章のID確認待ち: ' + counts.editorialIdReview + '件',
    '自動登録: 行いません'
  ].join('\n');
}

function summarizeReadiness(result) {
  const counts = {
    idConflicts: result.fixedIdConflicts.length,
    invalidIds: result.invalidMemoryIds.length,
    duplicateTitles: result.duplicateMemoryTitles.length,
    missingIds: result.missingMemoryIds.length,
    unlinkedEditorialTitles: result.unlinkedEditorialTitles.length,
    editorialIdReview: result.editorialIdReview.length
  };
  return {
    counts,
    readyForAutomaticImport: false,
    // A zero-warning report still requires explicit review and authorization.
    requiresEditorialReview: true
  };
}

function report(html) {
  const source = audit(html);
  const snapshot = buildEditorialSnapshot(html);
  const links = resolveEditorialTitleIds(html);
  const sections = Object.fromEntries(Object.entries(snapshot.sources).map(([name, entries]) =>
    [name, Array.isArray(entries) ? entries.length : Object.keys(entries).length]));
  const details = {
    mode: 'read-only',
    writes: 0,
    sourceSections: sections,
    fixedIdConflicts: source.conflictingMemoryIds,
    editorialIdLinks: links.resolved,
    editorialIdReview: links.needsReview,
    missingMemoryIds: source.missingMemoryIds,
    editorialOnlyTitles: source.editorialOnlyTitles,
    unlinkedEditorialTitles: source.unlinkedEditorialTitles,
    duplicateMemoryTitles: source.duplicateMemoryTitles,
    invalidMemoryIds: source.invalidMemoryIds,
    editorialFingerprints: source.editorialFingerprints
  };
  return { ...details, readiness: summarizeReadiness(details) };
}

if (require.main === module) {
  const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');
  const result = report(html);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatReviewSummary(result));
    console.log('');
    console.log('確認対象の作品');
    console.log(formatReviewQueue(result));
  }
}
module.exports = { report, summarizeReadiness, formatReviewSummary, reviewQueue, formatReviewQueue };
