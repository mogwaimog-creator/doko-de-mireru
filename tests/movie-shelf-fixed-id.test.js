'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');

test('fixed-ID shelf metadata shares a single request for posters and details', () => {
  assert.match(html, /const shelfFixedMovieRequests=new Map\(\)/);
  assert.match(html, /const data=await shelfFixedMovie\(m\.id\)/);
  assert.match(html, /const data=await shelfFixedMovie\(fixedId\)/);
});

test('fixed-ID lookup never falls back to title search', () => {
  const start = html.indexOf('async function fetchClassicFilm(item){');
  const end = html.indexOf('const approvedAwardStories=', start);
  assert.ok(start >= 0 && end > start, 'film lookup function must exist');
  const body = html.slice(start, end);
  assert.match(body, /if\(fixedId\|\|item\.title==='太陽の年'\)return null;/);
  assert.ok(
    body.indexOf('if(fixedId||item.title') < body.indexOf('for(const query of'),
    'fixed-ID guard must run before title-search fallback'
  );
});

test('unresolved poster lookup releases its cache marker for later retry', () => {
  assert.match(html, /if\(!poster\)\{\s*memoryCache\.delete\(key\);\s*return;/);
});
