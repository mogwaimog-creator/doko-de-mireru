'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { preview } = require('../scripts/preview-movie-shelf-ledger');
const { extractLiteral } = require('../scripts/audit-movie-shelf');
const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');

test('preview preserves all original editorial sections and does not write', () => {
  const result = preview(html);
  assert.equal(result.writes, 0);
  assert.equal(result.mode, 'read-only');
  for (const name of ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories'])
    assert.deepEqual(JSON.parse(JSON.stringify(result.snapshot.sources[name])),
      JSON.parse(JSON.stringify(extractLiteral(html, name))));
  assert.ok(result.records.every(item => item.key === 'movie:' + item.tmdbId));
});

test('preview attaches a film description without erasing its other text', () => {
  const result = preview(html);
  const entry = result.records.find(item => item.pageExtras.movieShelf.memoryFilms);
  assert.ok(entry);
  assert.equal(entry.pageExtras.movieShelf.memoryFilms.title, entry.title);
  assert.ok(result.snapshot.sources.memoryFilms.length >= result.records.filter(item => item.pageExtras.movieShelf.memoryFilms).length);
});

test('preview never auto-writes ambiguous editorial content', () => {
  const result = preview(html);
  assert.ok(result.review.length > 0);
  assert.equal(result.writes, 0);
});

test('duplicate movie title is held for review without losing source entries', () => {
  const memory = extractLiteral(html, 'memoryFilms');
  const film = memory.find(item => Number.isSafeInteger(item.id) && item.id > 0);
  assert.ok(film);
  const marker = 'const memoryFilms=[';
  assert.ok(html.includes(marker));
  const changed = html.replace(marker, marker + JSON.stringify(film) + ',');
  const result = preview(changed);
  assert.ok(result.review.some(item => item.title === film.title && item.reason === 'conflicting-id'));
  assert.ok(!result.records.some(item => item.title === film.title && item.pageExtras.movieShelf.memoryFilms));
  assert.equal(result.snapshot.sources.memoryFilms.length, memory.length + 1);
  assert.equal(result.writes, 0);
});

test('cross-section title collision blocks both candidates instead of choosing one', () => {
  const memory = extractLiteral(html, 'memoryFilms');
  const film = memory.find(item => Number.isSafeInteger(item.id) && item.id > 0);
  assert.ok(film);
  const marker = 'const classicKnownIds={';
  assert.ok(html.includes(marker));
  const altered = html.replace(marker, marker + '"アセンダンシー":' + film.id + ',');
  const result = preview(altered);
  assert.ok(result.review.some(item => item.reason === 'multiple-titles-for-id' && item.candidates.includes(film.id)));
  assert.ok(!result.records.some(item => item.tmdbId === film.id));
  assert.equal(result.writes, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(result.snapshot.sources.memoryFilms)),
    JSON.parse(JSON.stringify(memory)));
});

test('coverage accounts for every editorial source entry', () => {
  const result = preview(html);
  for (const name of ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories']) {
    assert.equal(result.coverage.sourceCounts[name],
      result.coverage.candidateCounts[name] + result.coverage.retainedForReview[name]);
    assert.ok(result.coverage.retainedForReview[name] >= 0);
  }
  assert.equal(result.writes, 0);
});

test('retained entries are identified by title without discarding their text', () => {
  const result = preview(html);
  for (const name of ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories']) {
    assert.equal(result.coverage.retainedEntries[name].length,
      result.coverage.retainedForReview[name]);
    assert.ok(result.coverage.retainedEntries[name].every(item => typeof item.title === 'string'));
  }
  assert.equal(result.writes, 0);
});
