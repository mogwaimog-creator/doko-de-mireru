'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extractLiteral, audit } = require('../scripts/audit-movie-shelf');
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
