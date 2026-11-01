'use strict';
// Local, read-only review report. No network requests, Redis writes or HTML changes.
// Run: node scripts/report-movie-shelf-migration.js
const fs = require('node:fs');
const path = require('node:path');
const { audit, buildEditorialSnapshot, resolveEditorialTitleIds } = require('./audit-movie-shelf');

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
  ].join('\\n');
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
  console.log(JSON.stringify(report(html), null, 2));
}
module.exports = { report, summarizeReadiness, formatReviewSummary };
