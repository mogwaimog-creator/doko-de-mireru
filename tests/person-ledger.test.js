'use strict';
const {test, afterEach} = require('node:test');
const assert = require('node:assert/strict');

const redisPath = require.resolve('../api/_redis');
const ledgerPath = require.resolve('../api/_person-ledger');
const previousRedis = require.cache[redisPath];
const previousFlag = process.env.WORK_LEDGER_ENABLED;
const previousResume = process.env.LEDGER_WRITES_RESUME;

afterEach(() => {
  if (previousResume === undefined) delete process.env.LEDGER_WRITES_RESUME;
  else process.env.LEDGER_WRITES_RESUME = previousResume;
  if (previousFlag === undefined) delete process.env.WORK_LEDGER_ENABLED;
  else process.env.WORK_LEDGER_ENABLED = previousFlag;
  delete require.cache[ledgerPath];
  if (previousRedis) require.cache[redisPath] = previousRedis;
  else delete require.cache[redisPath];
});

function setup() {
  process.env.LEDGER_WRITES_RESUME = '1';
  const values = new Map();
  const calls = [];
  require.cache[redisPath] = {
    id: redisPath, filename: redisPath, loaded: true,
    exports: {command: async args => {
      calls.push(args);
      const [op, key] = args;
      if (op === 'GET') return values.get(key) ?? null;
      if (op === 'SET') {
        if (args.includes('NX') && values.has(key)) return null;
        values.set(key, args[2]); return 'OK';
      }
      if (op === 'EVAL') {
        const lockKey = args[3], token = args[4];
        if (values.get(lockKey) === token) { values.delete(lockKey); return 1; }
        return 0;
      }
      throw new Error('Unexpected Redis command: ' + op);
    }}
  };
  delete require.cache[ledgerPath];
  return {...require(ledgerPath), values, calls};
}

test('first request stores person and second request reuses it without loading upstream', async () => {
  process.env.WORK_LEDGER_ENABLED = '1';
  const {withPersonLedger, values} = setup();
  let loads = 0;
  const load = async () => { loads++; return {id: 1813, name: 'Anne', cast: [{id: 1}]}; };
  assert.deepEqual(await withPersonLedger(1813, load), await withPersonLedger(1813, load));
  assert.equal(loads, 1);
  const saved = JSON.parse(values.get('doko:person:v1:1813'));
  assert.equal(saved.schemaVersion, 1);
  assert.equal(saved.person.cast.length, 1);
  assert.ok(Number.isFinite(Date.parse(saved.checkedAt)));
});

test('stale data refreshes after sixty days', async () => {
  process.env.WORK_LEDGER_ENABLED = '1';
  const {withPersonLedger, values} = setup();
  values.set('doko:person:v1:1813', JSON.stringify({
    schemaVersion: 1, checkedAt: '2020-01-01T00:00:00.000Z', person: {id: 1813, name: 'Old'}
  }));
  const result = await withPersonLedger(1813, async () => ({id: 1813, name: 'New'}));
  assert.equal(result.name, 'New');
  assert.equal(JSON.parse(values.get('doko:person:v1:1813')).person.name, 'New');
});

test('failed refresh serves previously saved person', async () => {
  process.env.WORK_LEDGER_ENABLED = '1';
  const {withPersonLedger, values} = setup();
  values.set('doko:person:v1:1813', JSON.stringify({
    schemaVersion: 1, checkedAt: '2020-01-01T00:00:00.000Z', person: {id: 1813, name: 'Saved'}
  }));
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await withPersonLedger(1813, async () => {throw new Error('TMDB down');})).name, 'Saved');
  } finally {console.error = originalError;}
});

test('disabled flag bypasses Redis', async () => {
  process.env.WORK_LEDGER_ENABLED = '0';
  const {withPersonLedger, calls} = setup();
  assert.equal((await withPersonLedger(1813, async () => ({id: 1813}))).id, 1813);
  assert.equal(calls.length, 0);
});

test('invalid upstream identity is rejected and lock released', async () => {
  process.env.WORK_LEDGER_ENABLED = '1';
  const {withPersonLedger, values} = setup();
  await assert.rejects(withPersonLedger(1813, async () => ({id: 999})), /Invalid person response/);
  assert.equal(values.has('doko:person:v1:1813:refresh-lock'), false);
});
