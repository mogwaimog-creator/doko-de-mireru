'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const redis = require('../api/_redis');
const original = redis.command;
const store = new Map();
let failRead = false, failLock = false, failDataWrite = false;
redis.command = async ([op, key, value, ...rest]) => {
  if (op === 'GET') { if (failRead) throw new Error('Redis GET failed'); return store.get(key) || null; }
  if (op === 'SET') {
    if (failDataWrite && key === keys('movie', 1004).data) throw new Error('Redis data write failed');
    if (failLock && rest[0] === 'NX') throw new Error('Redis lock failed');
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

test('Redis read outage does not trigger uncontrolled TMDB requests', async () => {
  failRead = true;
  let calls = 0;
  try {
    const result = await getSharedProviders('movie', 444, async () => { calls++; return {}; });
    assert.equal(result.source, 'cache-unavailable');
    assert.equal(result.unavailable, true);
    assert.equal(calls, 0);
  } finally { failRead = false; }
});

test('Redis lock outage preserves previous data without calling TMDB', async () => {
  const { data } = keys('movie', 555);
  store.set(data, JSON.stringify({window:'2026-10-30-18', availability:{flatrate:[{provider_id:8}]},lastSuccessfulAt:'2026-10-30T12:00:00Z'}));
  failLock = true;
  let calls = 0;
  try {
    const result = await getSharedProviders('movie', 555, async () => { calls++; return {}; }, new Date('2026-10-31T09:00:00Z'));
    assert.equal(result.source, 'cache-unavailable');
    assert.equal(result.stale, true);
    assert.equal(result.availability.flatrate[0].provider_id, 8);
    assert.equal(calls, 0);
  } finally { failLock = false; }
});

test('malformed current-window provider cache is not presented as fresh', async () => {
  const { data } = keys('movie', 666);
  store.set(data, JSON.stringify({window:'2026-10-31-18',availability:[],lastSuccessfulAt:'2026-10-31T09:00:00Z'}));
  let calls = 0;
  const result = await getSharedProviders('movie', 666, async () => {calls++; return {flatrate:[]};}, new Date('2026-10-31T09:30:00Z'));
  assert.equal(result.source, 'tmdb');
  assert.equal(calls, 1);
  assert.deepEqual(result.availability, {flatrate:[]});
});

test('failed refresh enters cooldown and subsequent visitors do not retry TMDB', async () => {
  const now = new Date('2026-10-31T09:00:00Z');
  let calls = 0;
  const load = async () => { calls++; throw new Error('TMDB unavailable'); };
  const first = await getSharedProviders('movie', 777, load, now);
  const second = await getSharedProviders('movie', 777, load, now);
  assert.equal(first.source, 'fallback');
  assert.equal(second.source, 'cooldown');
  assert.equal(second.unavailable, true);
  assert.equal(calls, 1);
});

test('cooldown preserves last known streaming providers as stale', async () => {
  const now = new Date('2026-10-31T09:00:00Z');
  const { data } = keys('tv', 888);
  store.set(data, JSON.stringify({
    window: '2026-10-31-06',
    availability: { flatrate: [{provider_id: 8}] },
    lastSuccessfulAt: '2026-10-31T00:00:00Z'
  }));
  let calls = 0;
  const load = async () => { calls++; throw new Error('TMDB unavailable'); };
  await getSharedProviders('tv', 888, load, now);
  const second = await getSharedProviders('tv', 888, load, now);
  assert.equal(second.source, 'cooldown');
  assert.equal(second.stale, true);
  assert.equal(second.availability.flatrate[0].provider_id, 8);
  assert.equal(calls, 1);
});

test('after cooldown expires, a recovered TMDB refresh replaces stale data', async () => {
  const now = new Date('2026-10-31T09:00:00Z');
  const { data, lock, failure } = keys('movie', 999);
  store.set(data, JSON.stringify({
    window: '2026-10-31-06',
    availability: {rent:[{provider_id:2}]},
    lastSuccessfulAt: '2026-10-31T00:00:00Z'
  }));
  let calls = 0;
  const first = await getSharedProviders('movie', 999, async () => {
    calls++; throw new Error('TMDB temporarily unavailable');
  }, now);
  assert.equal(first.stale, true);
  const waiting = await getSharedProviders('movie', 999, async () => {
    calls++; return {flatrate:[{provider_id:8}]};
  }, now);
  assert.equal(waiting.source, 'cooldown');
  assert.equal(calls, 1);

  // Simulate the Redis expiry of the 10-minute cooldown and 90-second lock.
  store.delete(failure);
  store.delete(lock);
  const recovered = await getSharedProviders('movie', 999, async () => {
    calls++; return {flatrate:[{provider_id:8}]};
  }, new Date('2026-10-31T09:11:00Z'));
  assert.equal(recovered.source, 'tmdb');
  assert.equal(recovered.stale, false);
  assert.equal(recovered.availability.flatrate[0].provider_id, 8);
  assert.equal(calls, 2);
  const next = await getSharedProviders('movie', 999, async () => {
    calls++; throw new Error('must not refetch');
  }, new Date('2026-10-31T09:12:00Z'));
  assert.equal(next.source, 'cache');
  assert.equal(next.warning, null);
  assert.equal(calls, 2);
});

test('a previous-window cooldown does not block the next JST update window', async () => {
  const { failure, lock } = keys('tv', 1001);
  store.set(failure, '2026-10-31-06');
  store.delete(lock);
  let calls = 0;
  const result = await getSharedProviders('tv', 1001, async () => {
    calls++; return {buy:[{provider_id:3}]};
  }, new Date('2026-10-31T09:00:00Z'));
  assert.equal(result.source, 'tmdb');
  assert.equal(result.window, '2026-10-31-18');
  assert.equal(calls, 1);
});

test('simultaneous visitors share one TMDB refresh while the lock is held', async () => {
  const now = new Date('2026-10-31T09:00:00Z');
  const { data, lock, failure } = keys('movie', 1002);
  store.delete(data);
  store.delete(lock);
  store.delete(failure);
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const load = async () => {
    calls++;
    await wait;
    return {flatrate:[{provider_id:8}]};
  };
  const firstPromise = getSharedProviders('movie', 1002, load, now);
  // Wait for the first loader to start and acquire the Redis lock.
  for (let i = 0; i < 20 && calls === 0; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  const pending = await Promise.all(
    Array.from({length: 8}, () => getSharedProviders('movie', 1002, load, now))
  );
  assert.equal(calls, 1);
  assert.ok(pending.every(result => result.source === 'pending'));
  assert.ok(pending.every(result => result.unavailable));
  release();
  const first = await firstPromise;
  assert.equal(first.source, 'tmdb');
  const next = await getSharedProviders('movie', 1002, load, now);
  assert.equal(next.source, 'cache');
  assert.equal(next.availability.flatrate[0].provider_id, 8);
  assert.equal(calls, 1);
});

test('while refresh is slow, other visitors see previous streaming as stale', async () => {
  const now = new Date('2026-10-31T09:00:00Z');
  const { data, lock, failure } = keys('tv', 1003);
  store.set(data, JSON.stringify({
    window: '2026-10-31-06',
    availability: {rent:[{provider_id:2}]},
    lastSuccessfulAt: '2026-10-31T00:00:00Z'
  }));
  store.delete(lock);
  store.delete(failure);
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const firstPromise = getSharedProviders('tv', 1003, async () => {
    calls++;
    await wait;
    return {flatrate:[{provider_id:8}]};
  }, now);
  for (let i = 0; i < 20 && calls === 0; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 1);
  const pending = await getSharedProviders('tv', 1003, async () => {
    calls++;
    throw new Error('must not fetch again');
  }, now);
  assert.equal(pending.source, 'pending');
  assert.equal(pending.stale, true);
  assert.equal(pending.availability.rent[0].provider_id, 2);
  assert.match(pending.warning, /前回確認/);
  release();
  const refreshed = await firstPromise;
  assert.equal(refreshed.source, 'tmdb');
  const latest = await getSharedProviders('tv', 1003, async () => {
    calls++;
    throw new Error('must not fetch after refresh');
  }, now);
  assert.equal(latest.source, 'cache');
  assert.equal(latest.stale, false);
  assert.equal(latest.availability.flatrate[0].provider_id, 8);
  assert.equal(calls, 1);
});

test('failed Redis save keeps previous providers and does not falsely mark refresh successful', async () => {
  const now = new Date('2026-10-31T09:00:00Z');
  const { data, lock, failure } = keys('movie', 1004);
  store.set(data, JSON.stringify({
    window: '2026-10-31-06',
    availability: {rent:[{provider_id:2}]},
    lastSuccessfulAt: '2026-10-31T00:00:00Z'
  }));
  store.delete(lock);
  store.delete(failure);
  let calls = 0;
  failDataWrite = true;
  try {
    const first = await getSharedProviders('movie', 1004, async () => {
      calls++;
      return {flatrate:[{provider_id:8}]};
    }, now);
    assert.equal(first.source, 'fallback');
    assert.equal(first.stale, true);
    assert.equal(first.availability.rent[0].provider_id, 2);
    assert.match(first.warning, /前回確認/);
    const second = await getSharedProviders('movie', 1004, async () => {
      calls++;
      throw new Error('must not retry during cooldown');
    }, now);
    assert.equal(second.source, 'cooldown');
    assert.equal(second.stale, true);
    assert.equal(calls, 1);
    assert.equal(JSON.parse(store.get(data)).window, '2026-10-31-06');
  } finally {
    failDataWrite = false;
  }
});
