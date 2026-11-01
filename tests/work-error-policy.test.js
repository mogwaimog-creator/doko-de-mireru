'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyWorkError } = require('../api/_work-error-policy');
test('404 needs ID review', () => assert.equal(classifyWorkError(404), 'id_review'));
test('429 is a rate limit', () => assert.equal(classifyWorkError(429), 'rate_limit'));
test('server failures are temporary', () => assert.equal(classifyWorkError(503), 'temporary_failure'));
test('other errors are classified', () => assert.equal(classifyWorkError(0), 'retrieval_failure'));
