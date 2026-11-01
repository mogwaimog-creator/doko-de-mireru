'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { report, formatReviewSummary, reviewQueue, formatReviewQueue } = require('../scripts/report-movie-shelf-migration');

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

test('review queue contains actionable title-level issues without changing data', () => {
  const result = report(html);
  const queue = reviewQueue(result);
  assert.ok(Array.isArray(queue));
  assert.equal(queue.filter(x => x.kind === 'editorial-id-review').length, result.editorialIdReview.length);
  assert.ok(queue.every(x => typeof x.title === 'string' && x.title.length > 0));
  assert.equal(result.writes, 0);
});

test('Japanese review checklist is numbered and includes issue categories', () => {
  const result = report(html);
  const items = reviewQueue(result);
  const checklist = formatReviewQueue(result);
  if (items.length) {
    assert.match(checklist, /^1\. /);
    assert.equal(checklist.split('\n').length, items.length);
  } else {
    assert.equal(checklist, '確認待ちの作品はありません。');
  }
});

test('read-only CLI prints Japanese review by default and supports JSON output', () => {
  const { execFileSync } = require('node:child_process');
  const script = path.join(__dirname, '../scripts/report-movie-shelf-migration.js');
  const japanese = execFileSync(process.execPath, [script], { encoding: 'utf8' });
  assert.match(japanese, /確認対象の作品/);
  assert.match(japanese, /自動登録: 行いません/);
  const json = JSON.parse(execFileSync(process.execPath, [script, '--json'], { encoding: 'utf8' }));
  assert.equal(json.writes, 0);
  assert.equal(json.readiness.readyForAutomaticImport, false);
});

test('mismatched fixed overrides are reported rather than silently accepted', () => {
  const source = html.replace(/(const classicKnownIds=\{)/, '$1"シャイニング":999999,');
  const result = report(source);
  assert.ok(result.overrideIdConflicts.some(item => item.title === 'シャイニング'));
  assert.ok(reviewQueue(result).some(item => item.kind === 'override-id-conflict' && item.title === 'シャイニング'));
  assert.equal(result.writes, 0);
});
