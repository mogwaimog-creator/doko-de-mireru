'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const redis = require('../api/_redis');
const original = redis.command;
const store = new Map();
redis.command = async ([op, key, value, ...rest]) => {
  if (op === 'GET') return store.get(key) || null;
  if (op === 'SET') {
    if (rest[0] === 'NX' && store.has(key)) return null;
    store.set(key, value); return 'OK';
  }
  if (op === 'DEL') { store.delete(key); return 1; }
  if (op === 'ZREM') return 1;
  if (op === 'ZADD') return 1;
  throw new Error('Unexpected Redis operation: ' + op);
};
const { windowId, getSharedProviders, keys } = require('../api/_shared-providers');
test('JST boundaries and overnight window', () => {
  assert.equal(windowId('2026-10-30T20:59:59Z'), '2026-10-30-18');
  assert.equal(windowId('2026-10-30T21:00:00Z'), '2026-10-31-06');
  assert.equal(windowId('2026-10-31T08:59:59Z'), '2026-10-31-06');
  assert.equal(windowId('2026-10-31T09:00:00Z'), '2026-10-31-18');
  assert.equal(windowId('2026-10-31T16:00:00Z'), '2026-10-31-18');
});
test('first visitor refreshes and second visitor reuses shared cache', async () => {
  let calls = 0;
  const now = new Date('2026-10-31T00:00:00Z');
  const load = async () => { calls++; return { flatrate: [{ provider_id: 8 }] }; };
  const a = await getSharedProviders('movie', 111, load, now);
  const b = await getSharedProviders('movie', 111, load, now);
  assert.equal(calls, 1);
  assert.equal(a.source, 'tmdb');
  assert.equal(b.source, 'cache');
  assert.equal(b.stale, false);
});
test('failed refresh keeps previous providers and never claims no streaming', async () => {
  const now = new Date('2026-10-31T09:00:00Z');
  const { data } = keys('movie', 222);
  store.set(data, JSON.stringify({ window: '2026-10-31-06', availability: { rent: [{ provider_id: 2 }] }, lastSuccessfulAt: '2026-10-31T00:00:00Z' }));
  const r = await getSharedProviders('movie', 222, async () => { throw Object.assign(new Error('TMDB 503'), {status:503}); }, now);
  assert.equal(r.source, 'fallback');
  assert.equal(r.stale, true);
  assert.equal(r.availability.rent[0].provider_id, 2);
  assert.match(r.warning, /前回確認/);
});
test('no previous data remains unknown when refresh fails', async () => {
  const r = await getSharedProviders('tv', 333, async () => { throw new Error('network'); }, new Date('2026-10-31T09:00:00Z'));
  assert.equal(r.availability, null);
  assert.equal(r.unavailable, true);
});
test.after(() => { redis.command = original; });
