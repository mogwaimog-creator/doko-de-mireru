'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { report } = require('../scripts/report-movie-shelf-migration');

const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');
test('read-only migration report accounts for all editorial sections', () => {
  const result = report(html);
  assert.equal(result.mode, 'read-only');
  assert.equal(result.writes, 0);
  for (const section of ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories']) {
    assert.ok(result.sourceSections[section] > 0);
    assert.equal(result.editorialFingerprints[section].length, 64);
  }
  assert.ok(Array.isArray(result.fixedIdConflicts));
  assert.ok(Array.isArray(result.unlinkedEditorialTitles));
});
