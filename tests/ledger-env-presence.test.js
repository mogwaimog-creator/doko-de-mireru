'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {check} = require('../scripts/check-ledger-env-presence');
test('offline credential check reports only presence and never exposes values', () => {
  const result = check({TMDB_API_KEY:'fixture-secret-a',UPSTASH_REDIS_REST_URL:'fixture-placeholder-b',UPSTASH_REDIS_REST_TOKEN:'fixture-secret-c'});
  assert.deepEqual(result, {TMDB_API_KEY:true,UPSTASH_REDIS_REST_URL:true,UPSTASH_REDIS_REST_TOKEN:true});
  assert(!JSON.stringify(result).includes('fixture'));
  assert.deepEqual(check({TMDB_API_KEY:''}), {TMDB_API_KEY:false,UPSTASH_REDIS_REST_URL:false,UPSTASH_REDIS_REST_TOKEN:false});
});
