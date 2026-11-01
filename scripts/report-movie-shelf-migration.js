'use strict';
// Local, read-only review report. No network requests, Redis writes or HTML changes.
// Run: node scripts/report-movie-shelf-migration.js
const fs = require('node:fs');
const path = require('node:path');
const { audit, buildEditorialSnapshot } = require('./audit-movie-shelf');

function report(html) {
  const source = audit(html);
  const snapshot = buildEditorialSnapshot(html);
  const sections = Object.fromEntries(Object.entries(snapshot.sources).map(([name, entries]) =>
    [name, Array.isArray(entries) ? entries.length : Object.keys(entries).length]));
  return {
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
}

if (require.main === module) {
  const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');
  console.log(JSON.stringify(report(html), null, 2));
}
module.exports = { report };
