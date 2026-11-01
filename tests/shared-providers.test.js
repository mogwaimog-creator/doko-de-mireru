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


test('06:00 and 18:00 JST refresh boundaries do not refresh before the boundary', async () => {
  const id = 1101;
  let calls = 0;
  const load = async () => ({ flatrate: [{ provider_id: ++calls }] });
  const beforeMorning = await getSharedProviders('movie', id, load, new Date('2026-11-01T20:59:59Z'));
  // The in-memory Redis stub does not implement EX expiry; simulate the lock's expiry.
  store.delete(keys('movie', id).lock);
  const afterMorning = await getSharedProviders('movie', id, load, new Date('2026-11-01T21:00:00Z'));
  const beforeEvening = await getSharedProviders('movie', id, load, new Date('2026-11-02T08:59:59Z'));
  store.delete(keys('movie', id).lock);
  const afterEvening = await getSharedProviders('movie', id, load, new Date('2026-11-02T09:00:00Z'));
  assert.equal(beforeMorning.source, 'tmdb');
  assert.equal(afterMorning.source, 'tmdb');
  assert.equal(beforeEvening.source, 'cache');
  assert.equal(afterEvening.source, 'tmdb');
  assert.equal(calls, 3);
  assert.equal(beforeMorning.window, '2026-11-01-18');
  assert.equal(afterMorning.window, '2026-11-02-06');
  assert.equal(afterEvening.window, '2026-11-02-18');
});


test('fresh confirmed empty availability is cached without repeated TMDB calls', async () => {
  const id = 1102;
  const now = new Date('2026-11-02T09:00:00Z');
  let calls = 0;
  const load = async () => { calls++; return {}; };
  const first = await getSharedProviders('movie', id, load, now);
  const second = await getSharedProviders('movie', id, load, now);
  assert.equal(first.source, 'tmdb');
  assert.deepEqual(first.availability, {});
  assert.equal(first.unavailable, false);
  assert.equal(second.source, 'cache');
  assert.deepEqual(second.availability, {});
  assert.equal(second.unavailable, false);
  assert.equal(calls, 1);
});


test('movie and TV with the same TMDB numeric ID never share provider cache', async () => {
  const id = 1103;
  const now = new Date('2026-11-02T09:00:00Z');
  let movieCalls = 0, tvCalls = 0;
  const movieLoad = async () => { movieCalls++; return { flatrate: [{ provider_id: 8 }] }; };
  const tvLoad = async () => { tvCalls++; return { rent: [{ provider_id: 2 }] }; };
  const movie = await getSharedProviders('movie', id, movieLoad, now);
  const tv = await getSharedProviders('tv', id, tvLoad, now);
  const movieAgain = await getSharedProviders('movie', id, movieLoad, now);
  const tvAgain = await getSharedProviders('tv', id, tvLoad, now);
  assert.equal(movie.source, 'tmdb');
  assert.equal(tv.source, 'tmdb');
  assert.equal(movieAgain.source, 'cache');
  assert.equal(tvAgain.source, 'cache');
  assert.deepEqual(movieAgain.availability, { flatrate: [{ provider_id: 8 }] });
  assert.deepEqual(tvAgain.availability, { rent: [{ provider_id: 2 }] });
  assert.equal(movieCalls, 1);
  assert.equal(tvCalls, 1);
  assert.notEqual(keys('movie', id).data, keys('tv', id).data);
});


test('TMDB provider bridge caches only Japanese availability, never another region', async () => {
  const { detailProviders } = require('../api/_detail-providers');
  const previous = process.env.SHARED_PROVIDER_ENABLED;
  process.env.SHARED_PROVIDER_ENABLED = '1';
  try {
    let calls = 0;
    const load = async () => {
      calls++;
      return { id: 1104, results: {
        US: { flatrate: [{ provider_id: 999, logo_path: '/us.png' }] },
        JP: { flatrate: [{ provider_id: 8, logo_path: '/jp.png' }] }
      } };
    };
    const first = await detailProviders('movie', 1104, load);
    const second = await detailProviders('movie', 1104, load);
    assert.deepEqual(first.availability, { flatrate: [{ provider_id: 8, logo_path: '/jp.png' }] });
    assert.deepEqual(second.availability, first.availability);
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.SHARED_PROVIDER_ENABLED;
    else process.env.SHARED_PROVIDER_ENABLED = previous;
  }
});

test('TMDB provider bridge treats missing JP as confirmed empty but malformed JP as unavailable', async () => {
  const { detailProviders } = require('../api/_detail-providers');
  const previous = process.env.SHARED_PROVIDER_ENABLED;
  process.env.SHARED_PROVIDER_ENABLED = '1';
  try {
    const missing = await detailProviders('movie', 1105, async () => ({ results: { US: { flatrate: [] } } }));
    assert.deepEqual(missing.availability, {});
    assert.equal(missing.unavailable, false);
    const malformed = await detailProviders('movie', 1106, async () => ({ results: { JP: 'invalid' } }));
    assert.equal(malformed.unavailable, true);
    const missingResults = await detailProviders('movie', 1107, async () => ({ id: 1107 }));
    assert.equal(missingResults.unavailable, true);
  } finally {
    if (previous === undefined) delete process.env.SHARED_PROVIDER_ENABLED;
    else process.env.SHARED_PROVIDER_ENABLED = previous;
  }
});


test('series-watch is read-only and returns missing entries without refreshing TMDB', async () => {
  const seriesPath = require.resolve('../api/series-watch');
  const savedCommand = redis.command;
  const calls = [];
  try {
    redis.command = async args => {
      calls.push(args);
      assert.equal(args[0], 'MGET');
      return args.slice(1).map(() => null);
    };
    delete require.cache[seriesPath];
    const handler = require('../api/series-watch');
    const response = {
      code: 0, body: null,
      setHeader() {},
      status(code) { this.code = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler({ method: 'GET', query: { series: 'mcu' } }, response);
    assert.equal(response.code, 200);
    assert.equal(response.body.complete, false);
    assert.ok(response.body.failures.length > 0);
    assert.equal(calls.length, 1);
  } finally {
    redis.command = savedCommand;
    delete require.cache[seriesPath];
  }
});


test('series-watch opt-in reads the new shared cache without updating it', async () => {
  const seriesPath = require.resolve('../api/series-watch');
  const savedCommand = redis.command;
  const savedFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  const calls = [];
  try {
    process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
    const now = new Date().toISOString();
    const { windowId } = require('../api/_shared-providers');
    redis.command = async args => {
      calls.push(args);
      assert.equal(args[0], 'MGET');
      return args.slice(1).map(key => key === 'doko:provider-window:v1:movie:1771'
        ? JSON.stringify({ window: windowId(), availability: { flatrate: [{ provider_id: 8 }] }, lastSuccessfulAt: now })
        : null);
    };
    delete require.cache[seriesPath];
    const handler = require('../api/series-watch');
    const res = {
      code: 0, body: null, setHeader() {},
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({ method: 'GET', query: { series: 'mcu' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.providers['movie:1771'].flatrate, [{ provider_id: 8 }]);
    assert.equal(res.body.providers['movie:1771'].stale, false);
    assert.ok(!res.body.failures.includes('movie:1771'));
    assert.equal(calls.length, 2);
  } finally {
    redis.command = savedCommand;
    if (savedFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = savedFlag;
    delete require.cache[seriesPath];
  }
});


test('series-watch shared read preserves legacy fallback when shared record is malformed', async () => {
  const seriesPath = require.resolve('../api/series-watch');
  const savedCommand = redis.command;
  const savedFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  try {
    process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
    redis.command = async args => {
      assert.equal(args[0], 'MGET');
      return args.slice(1).map(key => {
        if (key === 'doko:watch:v3:movie:1771') return JSON.stringify({
          flatrate: [{ provider_id: 9 }], checkedAt: new Date().toISOString()
        });
        if (key === 'doko:provider-window:v1:movie:1771') return '{bad json';
        return null;
      });
    };
    delete require.cache[seriesPath];
    const handler = require('../api/series-watch');
    const res = {
      code: 0, body: null, setHeader() {},
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({ method: 'GET', query: { series: 'mcu' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.providers['movie:1771'].flatrate, [{ provider_id: 9 }]);
    assert.equal(res.body.providers['movie:1771'].stale, false);
  } finally {
    redis.command = savedCommand;
    if (savedFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = savedFlag;
    delete require.cache[seriesPath];
  }
});


test('series-watch does not replace a fresh legacy record with a stale shared record', async () => {
  const seriesPath = require.resolve('../api/series-watch');
  const savedCommand = redis.command;
  const savedFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  try {
    process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
    redis.command = async args => args.slice(1).map(key => {
      if (key === 'doko:watch:v3:movie:1771') return JSON.stringify({
        flatrate: [{ provider_id: 9 }], checkedAt: new Date().toISOString()
      });
      if (key === 'doko:provider-window:v1:movie:1771') return JSON.stringify({
        window: '2020-01-01-06', availability: { flatrate: [{ provider_id: 8 }] },
        lastSuccessfulAt: '2020-01-01T00:00:00.000Z'
      });
      return null;
    });
    delete require.cache[seriesPath];
    const handler = require('../api/series-watch');
    const res = {
      code: 0, body: null, setHeader() {},
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({ method: 'GET', query: { series: 'mcu' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.providers['movie:1771'].flatrate, [{ provider_id: 9 }]);
    assert.equal(res.body.providers['movie:1771'].stale, false);
  } finally {
    redis.command = savedCommand;
    if (savedFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = savedFlag;
    delete require.cache[seriesPath];
  }
});


test('series-watch treats implausibly old shared data as stale despite matching window', async () => {
  const seriesPath = require.resolve('../api/series-watch');
  const savedCommand = redis.command;
  const savedFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  try {
    process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
    const { windowId } = require('../api/_shared-providers');
    redis.command = async args => args.slice(1).map(key => {
      if (key === 'doko:provider-window:v1:movie:1771') return JSON.stringify({
        window: windowId(), availability: { flatrate: [] },
        lastSuccessfulAt: '2020-01-01T00:00:00.000Z'
      });
      return null;
    });
    delete require.cache[seriesPath];
    const handler = require('../api/series-watch');
    const res = {
      code: 0, body: null, setHeader() {},
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({ method: 'GET', query: { series: 'mcu' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.providers['movie:1771'].stale, true);
  } finally {
    redis.command = savedCommand;
    if (savedFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = savedFlag;
    delete require.cache[seriesPath];
  }
});


test('series-watch chooses newer legacy observation even when shared window is current', async () => {
  const seriesPath = require.resolve('../api/series-watch');
  const savedCommand = redis.command;
  const savedFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  try {
    process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
    const { windowId } = require('../api/_shared-providers');
    redis.command = async args => args.slice(1).map(key => {
      if (key === 'doko:watch:v3:movie:1771') return JSON.stringify({
        flatrate: [{ provider_id: 9 }], checkedAt: new Date().toISOString()
      });
      if (key === 'doko:provider-window:v1:movie:1771') return JSON.stringify({
        window: windowId(), availability: { flatrate: [{ provider_id: 8 }] },
        lastSuccessfulAt: new Date(Date.now()-60000).toISOString()
      });
      return null;
    });
    delete require.cache[seriesPath];
    const handler = require('../api/series-watch');
    const res = {
      code: 0, body: null, setHeader() {},
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({ method: 'GET', query: { series: 'mcu' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.providers['movie:1771'].flatrate, [{ provider_id: 9 }]);
  } finally {
    redis.command = savedCommand;
    if (savedFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = savedFlag;
    delete require.cache[seriesPath];
  }
});


test('series-watch does not treat missing shared flatrate as a confirmed empty list', async () => {
  const seriesPath = require.resolve('../api/series-watch');
  const savedCommand = redis.command;
  const savedFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  try {
    process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
    redis.command = async args => args.slice(1).map(key => {
      if (key === 'doko:provider-window:v1:movie:1771') return JSON.stringify({
        window: '2000-01-01-06',
        availability: { rent: [{ provider_id: 9 }] },
        lastSuccessfulAt: new Date().toISOString()
      });
      return null;
    });
    delete require.cache[seriesPath];
    const handler = require('../api/series-watch');
    const res = {
      code: 0, body: null, setHeader() {},
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({ method: 'GET', query: { series: 'mcu' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.providers['movie:1771'], undefined);
    assert.ok(res.body.failures.includes('movie:1771'));
  } finally {
    redis.command = savedCommand;
    if (savedFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = savedFlag;
    delete require.cache[seriesPath];
  }
});

test('series-watch marks previous-window shared records stale even when recently fetched', async () => {
  const seriesPath = require.resolve('../api/series-watch');
  const savedCommand = redis.command;
  const savedFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  try {
    process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
    redis.command = async args => args.slice(1).map(key => {
      if (key === 'doko:provider-window:v1:movie:1771') return JSON.stringify({
        window: '2000-01-01-06',
        availability: { flatrate: [{ provider_id: 9 }] },
        lastSuccessfulAt: new Date().toISOString()
      });
      return null;
    });
    delete require.cache[seriesPath];
    const handler = require('../api/series-watch');
    const res = {
      code: 0, body: null, setHeader() {},
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({ method: 'GET', query: { series: 'mcu' } }, res);
    assert.equal(res.code, 200);
    assert.equal(res.body.providers['movie:1771'].stale, true);
    assert.equal(res.body.providers['movie:1771'].flatrate[0].provider_id, 9);
  } finally {
    redis.command = savedCommand;
    if (savedFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = savedFlag;
    delete require.cache[seriesPath];
  }
});


test('series provider endpoint stays disabled without opt-in and makes no TMDB request', async () => {
  const previous = process.env.SHARED_PROVIDER_ENABLED;
  const oldFetch = global.fetch;
  try {
    delete process.env.SHARED_PROVIDER_ENABLED;
    global.fetch = () => { throw new Error('Unexpected TMDB request'); };
    const handler = require('../api/series-providers');
    const headers = {};
    const res = {
      code: 0, body: null,
      setHeader(k,v) { headers[k]=v; },
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({ method:'GET', query:{ type:'movie', id:'1771' } },res);
    assert.equal(res.code,404);
    assert.equal(headers['Vercel-CDN-Cache-Control'],'s-maxage=60, stale-while-revalidate=60');
  } finally {
    global.fetch=oldFetch;
    if(previous===undefined)delete process.env.SHARED_PROVIDER_ENABLED;
    else process.env.SHARED_PROVIDER_ENABLED=previous;
  }
});

test('series provider endpoint rejects invalid identities before contacting TMDB', async () => {
  const previous = process.env.SHARED_PROVIDER_ENABLED;
  const oldFetch = global.fetch;
  try {
    process.env.SHARED_PROVIDER_ENABLED='1';
    global.fetch = () => { throw new Error('Unexpected TMDB request'); };
    const handler = require('../api/series-providers');
    const res = {
      code:0, body:null, setHeader() {},
      status(code) { this.code=code; return this; },
      json(body) { this.body=body; return this; }
    };
    await handler({method:'GET',query:{type:'movie',id:'not-a-number'}},res);
    assert.equal(res.code,400);
  } finally {
    global.fetch=oldFetch;
    if(previous===undefined)delete process.env.SHARED_PROVIDER_ENABLED;
    else process.env.SHARED_PROVIDER_ENABLED=previous;
  }
});


test('series-watch CDN cache is shorter only when shared read flag is enabled', async () => {
  const modulePath = require.resolve('../api/series-watch');
  const originalCommand = redis.command;
  const originalFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  try {
    redis.command = async args => args.slice(1).map(() => null);
    for (const enabled of [false, true]) {
      if (enabled) process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
      else delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
      delete require.cache[modulePath];
      const handler = require('../api/series-watch');
      const headers = {};
      const res = {
        setHeader(k, v) { headers[k] = v; },
        status() { return this; },
        json() { return this; }
      };
      await handler({method:'GET',query:{series:'mcu'}},res);
      assert.equal(headers['Cache-Control'], enabled
        ? 'public, max-age=0, s-maxage=30, stale-while-revalidate=30'
        : 'public, max-age=0, s-maxage=120, stale-while-revalidate=60');
    }
  } finally {
    redis.command = originalCommand;
    if (originalFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = originalFlag;
    delete require.cache[modulePath];
  }
});


test('series-watch marks previous JST window legacy observations stale only in shared mode', async () => {
  const modulePath = require.resolve('../api/series-watch');
  const originalCommand = redis.command;
  const originalFlag = process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse('2026-11-01T09:01:00Z'); // 18:01 JST
    redis.command = async args => args.slice(1).map(key =>
      key === 'doko:watch:v3:movie:1771'
        ? JSON.stringify({flatrate:[{provider_id:8}],checkedAt:'2026-11-01T08:59:00Z'})
        : null);
    for (const enabled of [false, true]) {
      if (enabled) process.env.SERIES_WATCH_SHARED_READ_ENABLED = '1';
      else delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
      delete require.cache[modulePath];
      let result;
      await require('../api/series-watch')({method:'GET',query:{series:'mcu'}},{
        setHeader(){},status(){return this;},json(body){result=body;return this;}
      });
      assert.equal(result.providers['movie:1771'].stale,enabled);
      assert.deepEqual(result.providers['movie:1771'].flatrate,[{provider_id:8}]);
    }
  } finally {
    Date.now = originalNow;
    redis.command = originalCommand;
    if (originalFlag === undefined) delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED = originalFlag;
    delete require.cache[modulePath];
  }
});


test('current-window cache with invalid timestamp cannot masquerade as fresh', async () => {
  const now = new Date('2026-11-01T09:05:00Z');
  for (const [id, stamp] of [[71001,'not-a-date'],[71002,'2026-11-02T09:05:00Z']]) {
    store.set(keys('movie',id).data,JSON.stringify({
      window:windowId(now),availability:{flatrate:[{provider_id:8}]},lastSuccessfulAt:stamp
    }));
    let calls = 0;
    const result = await getSharedProviders('movie',id,async()=>{
      calls++;
      return {flatrate:[{provider_id:9}]};
    },now);
    assert.equal(calls,1);
    assert.equal(result.source,'tmdb');
    assert.deepEqual(result.availability.flatrate,[{provider_id:9}]);
  }
});


test('shared cache cannot claim the current window with an earlier-window timestamp', async () => {
  const now = new Date('2026-11-01T09:05:00Z'); // JST 18:05
  const id = 71003;
  store.set(keys('movie',id).data,JSON.stringify({
    window:windowId(now),
    availability:{flatrate:[{provider_id:8}]},
    lastSuccessfulAt:'2026-11-01T08:59:00Z' // JST 17:59
  }));
  let calls = 0;
  const result = await getSharedProviders('movie',id,async()=>{
    calls++;
    return {flatrate:[{provider_id:9}]};
  },now);
  assert.equal(calls,1);
  assert.equal(result.source,'tmdb');
  assert.deepEqual(result.availability.flatrate,[{provider_id:9}]);
});


test('series-watch rejects a falsely current shared window as fresh', async () => {
  const modulePath=require.resolve('../api/series-watch');
  const originalCommand=redis.command;
  const originalFlag=process.env.SERIES_WATCH_SHARED_READ_ENABLED;
  const originalNow=Date.now;
  try {
    Date.now=()=>Date.parse('2026-11-01T09:05:00Z');
    process.env.SERIES_WATCH_SHARED_READ_ENABLED='1';
    redis.command=async args=>args.slice(1).map(key=>{
      if(key==='doko:provider-window:v1:movie:1771')return JSON.stringify({
        window:windowId(new Date('2026-11-01T09:05:00Z')),
        lastSuccessfulAt:'2026-11-01T08:59:00Z',
        availability:{flatrate:[{provider_id:8}]}
      });
      return null;
    });
    delete require.cache[modulePath];
    let result;
    await require('../api/series-watch')({method:'GET',query:{series:'mcu'}},{
      setHeader(){},status(){return this;},json(body){result=body;return this;}
    });
    assert.equal(result.providers['movie:1771'].stale,true);
    assert.deepEqual(result.providers['movie:1771'].flatrate,[{provider_id:8}]);
  }finally{
    Date.now=originalNow;
    redis.command=originalCommand;
    if(originalFlag===undefined)delete process.env.SERIES_WATCH_SHARED_READ_ENABLED;
    else process.env.SERIES_WATCH_SHARED_READ_ENABLED=originalFlag;
    delete require.cache[modulePath];
  }
});


test('opt-in series refresh enforces one series budget for repeated visitors',async()=>{
  const modulePath=require.resolve('../api/series-watch');
  const savedCommand=redis.command;
  const savedRefresh=process.env.SERIES_WATCH_REFRESH_ENABLED;
  const savedShared=process.env.SHARED_PROVIDER_ENABLED;
  const savedToken=process.env.TMDB_API_KEY;
  let budgetCalls=0,accepted=0;
  try{
    process.env.SERIES_WATCH_REFRESH_ENABLED='1';
    process.env.SHARED_PROVIDER_ENABLED='1';
    delete process.env.TMDB_API_KEY;
    redis.command=async args=>{
      if(args[0]==='MGET')return args.slice(1).map(()=>null);
      if(args[0]==='SET'&&args[1].startsWith('doko:series-refresh-budget:v1:')){
        budgetCalls++;
        if(accepted++===0)return 'OK';
        return null;
      }
      throw new Error('Unexpected command '+args[0]);
    };
    delete require.cache[modulePath];
    const handler=require('../api/series-watch');
    for(let i=0;i<3;i++){
      let result;
      await handler({method:'GET',query:{series:'godzilla'}},{
        setHeader(){},status(){return this;},json(body){result=body;return this;}
      });
      assert.equal(result.complete,false);
    }
    assert.equal(budgetCalls,3);
    assert.equal(accepted,3);
  }finally{
    redis.command=savedCommand;
    if(savedRefresh===undefined)delete process.env.SERIES_WATCH_REFRESH_ENABLED;
    else process.env.SERIES_WATCH_REFRESH_ENABLED=savedRefresh;
    if(savedShared===undefined)delete process.env.SHARED_PROVIDER_ENABLED;
    else process.env.SHARED_PROVIDER_ENABLED=savedShared;
    if(savedToken===undefined)delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY=savedToken;
    delete require.cache[modulePath];
  }
});
