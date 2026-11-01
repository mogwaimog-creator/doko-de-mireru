'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { report, formatReviewSummary } = require('../scripts/report-movie-shelf-migration');

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

test('readiness summary never approves automatic editorial import', () => {
  const result = report(html);
  assert.equal(result.readiness.readyForAutomaticImport, false);
  assert.equal(result.readiness.requiresEditorialReview, true);
  assert.equal(result.readiness.counts.idConflicts, result.fixedIdConflicts.length);
  assert.equal(result.readiness.counts.unlinkedEditorialTitles, result.unlinkedEditorialTitles.length);
});

test('report includes editorial title ID links and review items', () => {
  const result = report(html);
  assert.ok(result.editorialIdLinks.verifiedClassicInfo);
  assert.ok(result.editorialIdLinks.approvedAwardStories);
  assert.ok(Array.isArray(result.editorialIdReview));
  assert.equal(result.readiness.counts.editorialIdReview, result.editorialIdReview.length);
  assert.equal(result.readiness.readyForAutomaticImport, false);
});

test('Japanese review summary shows counts and states no automatic import', () => {
  const summary = formatReviewSummary(report(html));
  assert.match(summary, /名作映画の棚/);
  assert.match(summary, /ID衝突: [0-9]+件/);
  assert.match(summary, /文章のID確認待ち: [0-9]+件/);
  assert.match(summary, /自動登録: 行いません/);
});
