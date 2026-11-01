'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractLiteral, audit, compareEditorialSources, editorialEntryFingerprints, compareEditorialEntries, planEditorialMigration, buildEditorialSnapshot, resolveEditorialTitleIds } = require('../scripts/audit-movie-shelf');
const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');

test('movie shelf editorial blocks can be audited without writing data', () => {
  const result = audit(html);
  assert.ok(result.memoryFilms > 0);
  assert.ok(result.verifiedDescriptions > 0);
  assert.ok(result.awardStoryEntries > 0);
  assert.deepEqual(result.editorialSources, ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories']);
  assert.deepEqual(result.invalidMemoryIds, []);
});

test('the original editorial text remains available for later migration', () => {
  const films = extractLiteral(html, 'memoryFilms');
  assert.ok(films.some(film => typeof film.summary === 'string' && film.summary.length));
  assert.ok(films.some(film => typeof film.memory === 'string' && film.memory.length));
  const stories = extractLiteral(html, 'approvedAwardStories');
  assert.ok(Object.values(stories).some(lines => Array.isArray(lines) && lines.length > 0));
});

test('editorial fingerprints detect later text edits without touching other blocks', () => {
  const original = audit(html).editorialFingerprints;
  const changed = html.replace('長い廊下、双子の少女', '長い廊下と双子の少女');
  assert.notEqual(changed, html, 'fixture must contain the original text');
  const updated = audit(changed).editorialFingerprints;
  assert.notEqual(updated.memoryFilms, original.memoryFilms);
  assert.equal(updated.verifiedClassicInfo, original.verifiedClassicInfo);
  assert.equal(updated.approvedAwardStories, original.approvedAwardStories);
});

test('comparison identifies unchanged, changed and not-yet-tracked editorial blocks', () => {
  const oldHashes = audit(html).editorialFingerprints;
  const newHashes = audit(html.replace('長い廊下、双子の少女', '長い廊下と双子の少女')).editorialFingerprints;
  assert.deepEqual(compareEditorialSources(oldHashes, newHashes), {
    memoryFilms: 'changed',
    verifiedClassicInfo: 'unchanged',
    approvedAwardStories: 'unchanged'
  });
  assert.equal(compareEditorialSources({}, newHashes).memoryFilms, 'untracked');
});

test('individual movie text edits are detected without flagging unrelated entries', () => {
  const before = editorialEntryFingerprints(html);
  const edited = html.replace('長い廊下、双子の少女', '長い廊下と双子の少女');
  assert.notEqual(edited, html);
  const changes = compareEditorialEntries(before, editorialEntryFingerprints(edited));
  assert.deepEqual(changes.memoryFilms.changed, ['movie:694:シャイニング']);
  assert.deepEqual(changes.memoryFilms.added, []);
  assert.deepEqual(changes.memoryFilms.removed, []);
  assert.deepEqual(changes.verifiedClassicInfo.changed, []);
  assert.deepEqual(changes.approvedAwardStories.changed, []);
});

test('editorial migration plan flags changed work for review and never writes automatically', () => {
  const previous = editorialEntryFingerprints(html);
  const next = editorialEntryFingerprints(html.replace('長い廊下、双子の少女', '長い廊下と双子の少女'));
  const plan = planEditorialMigration(previous, next);
  assert.deepEqual(plan.memoryFilms.reviewBeforeImport, ['movie:694:シャイニング']);
  assert.deepEqual(plan.memoryFilms.missingFromSource, []);
  for (const section of Object.values(plan)) assert.equal(section.autoWrites, 0);
});

test('read-only snapshot retains original editorial text and independent source sections', () => {
  const snapshot = buildEditorialSnapshot(html);
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.sources.memoryFilms[0].title, 'シャイニング');
  assert.match(snapshot.sources.memoryFilms[0].memory, /長い廊下、双子の少女/);
  assert.ok(Object.keys(snapshot.sources.verifiedClassicInfo).length > 0);
  assert.ok(Object.keys(snapshot.sources.approvedAwardStories).length > 0);
  assert.equal(snapshot.fingerprints.memoryFilms['movie:694:シャイニング'].length, 64);
});

test('audit identifies conflicting IDs without discarding any editorial record', () => {
  const original = extractLiteral(html, 'memoryFilms')[0];
  const changed = html.replace(
    '"title":"13日の金曜日","id":4488',
    '"title":"13日の金曜日","id":694'
  );
  assert.notEqual(changed, html);
  const result = audit(changed);
  assert.ok(result.conflictingMemoryIds.some(item =>
    item.id === 694 && item.titles.includes(original.title) && item.titles.includes('13日の金曜日')));
  assert.equal(result.memoryFilms, audit(html).memoryFilms);
});

test('award and history editorial titles are preserved even when absent from memory shelf', () => {
  const result = audit(html);
  const awardTitles = Object.keys(extractLiteral(html, 'approvedAwardStories'));
  const memoryTitles = new Set(extractLiteral(html, 'memoryFilms').map(item => item.title));
  for (const title of awardTitles.filter(title => !memoryTitles.has(title))) {
    assert.ok(result.editorialOnlyTitles.includes(title));
  }
  for (const title of result.unlinkedEditorialTitles) {
    assert.ok(result.editorialOnlyTitles.includes(title));
  }
});

test('editorial ID resolution uses explicit IDs and never guesses unknown titles', () => {
  const result = resolveEditorialTitleIds(html);
  assert.equal(result.writes, 0);
  for (const [section, titles] of Object.entries(result.resolved)) {
    for (const [title, id] of Object.entries(titles)) {
      assert.ok(Number.isSafeInteger(id) && id > 0, section + ':' + title);
    }
  }
  assert.ok(result.needsReview.every(entry =>
    ['missing-id', 'conflicting-ids'].includes(entry.reason)));
});
