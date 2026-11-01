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


test('detail provider descriptions distinguish stale, unavailable, and current information', () => {
  assert.match(html, /providerStatus\.stale \|\| providerStatus\.unavailable/);
  assert.match(html, /providerStatus\.warning \|\| "現在、最新の配信情報を確認できません。"/);
  assert.match(html, /movie\.provider_status && movie\.provider_status\.unavailable[\\s\\S]*?配信なしと確定したわけではありません/);
  assert.match(html, /movie\.provider_status && movie\.provider_status\.stale[\\s\\S]*?前回確認した配信情報です/);
});

test('related-series card reports unavailable provider information without falsely saying none', () => {
  assert.match(html, /if \(movie\.provider_status && movie\.provider_status\.unavailable\) \{[\\s\\S]*?element\.textContent = "配信情報を確認できません";[\\s\\S]*?return;/);
});
