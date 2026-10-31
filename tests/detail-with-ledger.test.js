'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const adapterPath = require.resolve('../api/_detail-with-ledger');
const ledgerPath = require.resolve('../api/_work-ledger');

function setup({ readError = false, writeError = false } = {}) {
  const records = new Map();
  let reads = 0, writes = 0, loads = 0;
  const ledger = {
    async getWork(type, id) {
      reads++;
      if (readError) throw Error('Redis read failed');
      return records.get(type + ':' + id) || null;
    },
    async putWork(type, id, source) {
      writes++;
      if (writeError) throw Error('Redis write failed');
      const record = require('../api/_work-ledger').normalizeWork(type, id, source);
      records.set(type + ':' + id, record);
      return record;
    }
  };
  Module._load = function(request, parent, isMain) {
    if (request === './_work-ledger' && parent && parent.filename === adapterPath) return ledger;
    return originalLoad.apply(this, arguments);
  };
  delete require.cache[adapterPath];
  const adapter = require('../api/_detail-with-ledger');
  Module._load = originalLoad;
  const previousFlag = process.env.WORK_LEDGER_ENABLED;
  process.env.WORK_LEDGER_ENABLED = '1';
  const movie = {
    id: 123, title: '作品', original_title: 'Film', release_date: '2020-01-01',
    credits: { cast: [], crew: [] }, genres: [], runtime: 110
  };
  async function call(type = 'movie', id = 123) {
    return adapter.detailWithLedger(type, id, async () => { loads++; return movie; });
  }
  function cleanup() {
    if (previousFlag === undefined) delete process.env.WORK_LEDGER_ENABLED;
    else process.env.WORK_LEDGER_ENABLED = previousFlag;
    delete require.cache[adapterPath];
  }
  return { call, cleanup, counts: () => ({ reads, writes, loads }), records, adapter };
}

test('enabled flag: TMDB only on first detail request', async () => {
  const h = setup();
  try {
    assert.equal((await h.call()).title, '作品');
    assert.equal((await h.call()).title, '作品');
    assert.deepEqual(h.counts(), { reads: 2, writes: 1, loads: 1 });
  } finally { h.cleanup(); }
});

test('disabled flag: always use original detail route', async () => {
  const h = setup();
  try {
    process.env.WORK_LEDGER_ENABLED = '0';
    await h.call();
    await h.call();
    assert.deepEqual(h.counts(), { reads: 0, writes: 0, loads: 2 });
  } finally { h.cleanup(); }
});

test('Redis read failure falls back to TMDB', async () => {
  const h = setup({ readError: true });
  try {
    assert.equal((await h.call()).title, '作品');
    assert.equal(h.counts().loads, 1);
  } finally { h.cleanup(); }
});

test('Redis write failure still returns TMDB metadata', async () => {
  const h = setup({ writeError: true });
  try {
    assert.equal((await h.call()).title, '作品');
    assert.equal(h.counts().loads, 1);
  } finally { h.cleanup(); }
});

test('TMDB retrieval error is rethrown without changing the user-facing result', async () => {
  const h = setup();
  try {
    await assert.rejects(
      h.adapter.detailWithLedger('movie', 123, async () => {
        const error = new Error('TMDB unavailable');
        error.status = 503;
        throw error;
      }),
      /TMDB unavailable/
    );
  } finally { h.cleanup(); }
});
