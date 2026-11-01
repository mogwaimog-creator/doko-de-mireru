'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { restore } = require('../api/_detail-with-ledger');
const { fromTmdb } = require('../api/_work-from-tmdb');
const { normalizeWork } = require('../api/_work-ledger');

test('movie metadata survives TMDB -> ledger -> detail roundtrip', () => {
  const original = {
    id: 123, title: '映画', original_title: 'Movie',
    release_date: '2020-01-01', runtime: 120, overview: '説明',
    genres: [{ id: 28, name: 'アクション' }],
    poster_path: '/poster.jpg', vote_average: 7.5, vote_count: 20,
    belongs_to_collection: { id: 99, name: 'シリーズ' },
    credits: { cast: [{ id: 1, name: '俳優', character: '主人公', profile_path: '/actor.jpg' }],
      crew: [{ id: 2, name: '監督', job: 'Director' }] }
  };
  const record = normalizeWork('movie', 123, fromTmdb('movie', original));
  const result = restore('movie', record);
  assert.equal(result.title, original.title);
  assert.equal(result.runtime, 120);
  assert.equal(result.belongs_to_collection.id, 99);
  assert.equal(result.credits.cast[0].profile_path, '/actor.jpg');
  assert.equal(result.credits.crew[0].job, 'Director');
  assert.equal(result['watch/providers'], undefined);
});

test('TV seasons and cast survive roundtrip without streaming', () => {
  const original = {
    id: 456, name: 'ドラマ', original_name: 'Drama',
    first_air_date: '2019-01-01', episode_run_time: [45],
    seasons: [{ id: 4, season_number: 1, name: 'シーズン1', episode_count: 12,
      air_date: '2019-01-01', poster_path: '/season.jpg' }],
    credits: { cast: [], crew: [] }, genres: [],
    'watch/providers': { results: { JP: { flatrate: [{ provider_id: 8 }] } } }
  };
  const record = normalizeWork('tv', 456, fromTmdb('tv', original));
  const result = restore('tv', record);
  assert.equal(result.name, 'ドラマ');
  assert.equal(result.episode_run_time[0], 45);
  assert.equal(result.seasons[0].episode_count, 12);
  assert.equal(result['watch/providers'], undefined);
});

test('movie shelf editorial additions survive ledger normalization without affecting shared fields', () => {
  const source = {
    title: '名作映画',
    posterPath: '/poster.jpg',
    pageExtras: {
      movieShelf: {
        shelfIntro: '最初の紹介文',
        awards: '映画賞の補足',
        boxOffice: '当時の興行',
        historicalContext: '公開当時の反響',
        additionalNotes: '後から書き足した裏話'
      }
    }
  };
  const first = normalizeWork('movie', 123, source);
  const revised = normalizeWork('movie', 123, {
    ...first,
    pageExtras: {
      ...first.pageExtras,
      movieShelf: {
        ...first.pageExtras.movieShelf,
        additionalNotes: 'さらに修正した裏話'
      }
    }
  });
  assert.equal(revised.title, '名作映画');
  assert.equal(revised.posterPath, '/poster.jpg');
  assert.equal(revised.pageExtras.movieShelf.awards, '映画賞の補足');
  assert.equal(revised.pageExtras.movieShelf.boxOffice, '当時の興行');
  assert.equal(revised.pageExtras.movieShelf.historicalContext, '公開当時の反響');
  assert.equal(revised.pageExtras.movieShelf.additionalNotes, 'さらに修正した裏話');
});
