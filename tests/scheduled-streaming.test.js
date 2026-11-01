'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { windowJST } = require('../api/update-streaming')._test;
test('scheduled series updates follow 06:00 and 18:00 JST boundaries', () => {
  assert.equal(windowJST(Date.parse('2026-10-30T20:59:59Z')), '2026-10-30-18');
  assert.equal(windowJST(Date.parse('2026-10-30T21:00:00Z')), '2026-10-31-06');
  assert.equal(windowJST(Date.parse('2026-10-31T08:59:59Z')), '2026-10-31-06');
  assert.equal(windowJST(Date.parse('2026-10-31T09:00:00Z')), '2026-10-31-18');
  assert.equal(windowJST(Date.parse('2026-10-31T16:00:00Z')), '2026-10-31-18');
});
test('scheduled endpoint rejects unauthenticated requests', async () => {
  const handler = require('../api/update-streaming');
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-only-secret';
  const req = { method:'GET', headers:{} };
  const res = {
    headers:{}, setHeader(k,v){this.headers[k]=v;},
    status(n){this.code=n;return this;},
    json(v){this.body=v;return this;}
  };
  try {
    await handler(req,res);
    assert.equal(res.code,401);
    assert.equal(res.body.error,'Unauthorized');
  } finally {
    if(previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET=previous;
  }
});
