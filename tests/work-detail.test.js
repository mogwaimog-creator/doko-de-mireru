'use strict';

// Run with: node --test tests/work-detail.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const endpointPath = require.resolve('../api/work-detail');
const ledgerPath = require.resolve('../api/_work-ledger');

function harness({ cached = null, redisError = false, tmdbStatus = 200 } = {}) {
  const records = new Map();
  if (cached) records.set('movie:123', cached);
  let reads = 0, writes = 0, tmdbCalls = 0;
  const command = async ([verb, key, value, condition]) => {
    if (redisError) throw new Error('Redis unavailable');
    if (verb === 'GET') { reads++; return records.get(key.replace('doko:work:v1:', '')) || null; }
    if (verb === 'SET') { const name = key.replace('doko:work:v1:', ''); if (condition === 'NX' && records.has(name)) return null; writes++; records.set(name, value); return 'OK'; }
    throw new Error('Unexpected Redis command');
  };
  const previousFetch = global.fetch;
  const previousKey = process.env.TMDB_API_KEY;
  Module._load = function(request, parent, isMain) {
    if (request === './_redis' && parent && parent.filename === ledgerPath) return { command };
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[endpointPath];
  delete require.cache[ledgerPath];
  const handler = require('../api/work-detail');
  Module._load = originalLoad;
  process.env.TMDB_API_KEY = 'test-only-key';
  global.fetch = async () => {
    tmdbCalls++;
    return {
      ok: tmdbStatus === 200, status: tmdbStatus,
      json: async () => ({
        id: 123, title: 'テスト映画', original_title: 'Test Film',
        release_date: '2020-01-01', overview: '紹介',
        genres: [], credits: { cast: [], crew: [] }
      })
    };
  };
  async function call(query = { type: 'movie', id: '123' }, method = 'GET') {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; }
    };
    await handler({ method, query }, res);
    return res;
  }
  function cleanup() {
    global.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.TMDB_API_KEY;
    else process.env.TMDB_API_KEY = previousKey;
    delete require.cache[endpointPath];
    delete require.cache[ledgerPath];
  }
  return { call, cleanup, stats: () => ({ reads, writes, tmdbCalls }) };
}

test('first request stores metadata; second request uses ledger', async () => {
  const h = harness();
  try {
    const first = await h.call();
    assert.equal(first.statusCode, 200);
    assert.equal(first.body.source, 'tmdb');
    assert.equal(first.body.work.title, 'テスト映画');
    const second = await h.call();
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.source, 'ledger');
    assert.equal(h.stats().tmdbCalls, 1);
    assert.equal(h.stats().writes, 1);
    assert.equal(second.headers['Cache-Control'], 'no-store');
  } finally { h.cleanup(); }
});

test('TMDB error does not overwrite ledger', async () => {
  const h = harness({ tmdbStatus: 503 });
  try {
    const response = await h.call();
    assert.equal(response.statusCode, 502);
    assert.equal(h.stats().writes, 0);
  } finally { h.cleanup(); }
});

test('Redis outage returns metadata without persisting', async () => {
  const h = harness({ redisError: true });
  try {
    const response = await h.call();
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.source, 'tmdb');
  } finally { h.cleanup(); }
});

test('invalid input does not contact TMDB', async () => {
  const h = harness();
  try {
    assert.equal((await h.call({ type: 'person', id: '123' })).statusCode, 400);
    assert.equal((await h.call({ type: 'movie', id: '-2' })).statusCode, 400);
    assert.equal((await h.call({ type: 'movie', id: '123' }, 'POST')).statusCode, 405);
    assert.equal(h.stats().tmdbCalls, 0);
  } finally { h.cleanup(); }
});


test('first-write-wins preserves a concurrent registration', async () => {
  const { normalizeWork } = require('../api/_work-ledger');
  const original = normalizeWork('movie', 999, {
    title: '編集済み作品', pageExtras: { shelf: { note: '編集した紹介文' } },
    verification: { identity: 'verified', metadata: 'reviewed' }
  });
  // Isolate the atomic NX behavior from Redis and ensure the original survives.
  const stored = new Map([['doko:work:v1:movie:999', JSON.stringify(original)]]);
  const workPath = require.resolve('../api/_work-ledger');
  const priorLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (request === './_redis' && parent?.filename === workPath) return {
      command: async ([verb, key, value, flag]) => {
        if (verb === 'GET') return stored.get(key) || null;
        if (verb === 'SET') { if (flag === 'NX' && stored.has(key)) return null; stored.set(key, value); return 'OK'; }
        throw Error('Unexpected command');
      }
    };
    return priorLoad.apply(this, arguments);
  };
  delete require.cache[workPath];
  try {
    const ledger = require('../api/_work-ledger');
    const result = await ledger.putWorkIfAbsent('movie', 999, { title: 'TMDBの作品名' });
    assert.equal(result.title, '編集済み作品');
    assert.equal(result.pageExtras.shelf.note, '編集した紹介文');
    assert.equal(result.verification.identity, 'verified');
  } finally {
    Module._load = priorLoad;
    delete require.cache[workPath];
  }
});
