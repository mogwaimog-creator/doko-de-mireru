'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalize, recordError, listErrors, KEY } = require('../api/_ops-errors');

test('error journal normalizes events without retaining arbitrary payloads', () => {
  const event = normalize({
    area: 'work', code: 'SERIES_IMPORT_FAILED', type: 'movie', id: 123,
    message: '登録できません', secret: 'must-not-persist',
    stack: 'must-not-persist'
  });
  assert.match(event.eventId, /^[0-9a-f-]{36}$/);
  assert.equal(event.status, 'open');
  assert.equal(event.id, 123);
  assert.equal(event.secret, undefined);
  assert.equal(event.stack, undefined);
});

test('error journal bounds writes and limits returned history', async () => {
  const commands = [];
  const saved = [];
  const write = async args => {
    commands.push(args);
    if (args[0] === 'LPUSH') saved.unshift(args[2]);
    if (args[0] === 'LTRIM') saved.splice(args[3] + 1);
    return 'OK';
  };
  await recordError({area:'streaming',code:'PROVIDER_FAILED',message:'一時的な障害'}, {write});
  assert.deepEqual(commands[0].slice(0,2), ['LPUSH', KEY]);
  assert.deepEqual(commands[1], ['LTRIM', KEY, 0, 499]);
  const errors = await listErrors({limit:999,read:async args => {
    assert.deepEqual(args, ['LRANGE',KEY,0,99]);
    return saved;
  }});
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'PROVIDER_FAILED');
});

test('invalid error category and code are rejected', () => {
  assert.throws(() => normalize({area:'unknown',code:'FAIL'}));
  assert.throws(() => normalize({area:'work',code:'bad code'}));
});
