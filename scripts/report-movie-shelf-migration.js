'use strict';
// Local, read-only review report. No network requests, Redis writes or HTML changes.
// Run: node scripts/report-movie-shelf-migration.js
const fs = require('node:fs');
const path = require('node:path');
const { audit, buildEditorialSnapshot } = require('./audit-movie-shelf');

function summarizeReadiness(result) {
  const counts = {
    idConflicts: result.fixedIdConflicts.length,
    invalidIds: result.invalidMemoryIds.length,
    duplicateTitles: result.duplicateMemoryTitles.length,
    missingIds: result.missingMemoryIds.length,
    unlinkedEditorialTitles: result.unlinkedEditorialTitles.length
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
  const sections = Object.fromEntries(Object.entries(snapshot.sources).map(([name, entries]) =>
    [name, Array.isArray(entries) ? entries.length : Object.keys(entries).length]));
  const details = {
    mode: 'read-only',
    writes: 0,
    sourceSections: sections,
    fixedIdConflicts: source.conflictingMemoryIds,
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
module.exports = { report, summarizeReadiness };
