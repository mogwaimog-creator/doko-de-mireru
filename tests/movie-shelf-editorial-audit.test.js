'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractLiteral, audit, compareEditorialSources, editorialEntryFingerprints, compareEditorialEntries, planEditorialMigration, buildEditorialSnapshot } = require('../scripts/audit-movie-shelf');
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
