'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../detail.html'), 'utf8');

test('detail page displays a provider status notice only when required', () => {
  assert.match(html, /id="providerStatusNotice"[^>]*role="status"[^>]*aria-live="polite"[^>]*hidden/);
  assert.match(html, /providerNotice\.hidden = !warning/);
  assert.match(html, /providerStatus\.stale \|\| providerStatus\.unavailable/);
});

test('detail page does not claim no streaming when provider lookup failed', () => {
  assert.match(html, /movie\.provider_status && movie\.provider_status\.unavailable/);
  assert.match(html, /配信されていないという意味ではありません/);
  assert.match(html, /配信されていないと確定したわけではありません/);
  assert.match(html, /faqs\.forEach\(function\(item\)/);
});
