'use strict';
// Lazy shared provider cache: the first request after 06:00 / 18:00 JST
// refreshes a work; later visitors reuse the saved result.
// Standalone opt-in helper. Existing routes remain unchanged.
const { command } = require('./_redis');
const { identity } = require('./_work-ledger');
const { providerResult } = require('./_provider-fallback');
const { recordIssue, clearIssue } = require('./_work-issues');
const PREFIX = 'doko:provider-window:v1';
const LOCK_SECONDS = 90;
const FAILURE_COOLDOWN_SECONDS = 600;

function windowId(now = new Date()) {
  const d = new Date(now);
  if (!Number.isFinite(d.getTime())) throw new Error('Invalid date');
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const hour = jst.getUTCHours();
  if (hour < 6) jst.setUTCDate(jst.getUTCDate() - 1);
  const date = jst.toISOString().slice(0, 10);
  return date + (hour >= 6 && hour < 18 ? '-06' : '-18');
}
function keys(type, id) {
  const item = identity(type, id);
  const base = PREFIX + ':' + item.type + ':' + item.id;
  return { data: base, lock: base + ':lock', failure: base + ':failure' };
}
function parse(raw) {
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch (_) { return null; }
}
async function safeIssue(action) {
  try { await action(); } catch (error) { console.error('PROVIDER ISSUE UPDATE FAILED', error); }
}
async function getSharedProviders(type, id, load, now = new Date()) {
  if (typeof load !== 'function') throw new Error('Provider loader is required');
  const window = windowId(now);
  const { data, lock, failure } = keys(type, id);
  let saved;
  try { saved = parse(await command(['GET', data])); }
  catch (error) {
    console.error('SHARED PROVIDER CACHE READ FAILED', error);
    // Do not stamp a cache outage as confirmed lack of streaming.
    // Avoid bypassing the shared cache with one TMDB call per visitor.
    return { ...providerResult(), window, source: 'cache-unavailable' };
  }
  if (saved && saved.window === window && saved.availability && typeof saved.availability === 'object' && !Array.isArray(saved.availability)) {
    return { ...providerResult({ fresh: saved.availability }), lastSuccessfulAt: saved.lastSuccessfulAt, window, source: 'cache' };
  }
  // After a failed refresh, wait before another visitor attempts TMDB.
  // The retry marker is scoped to the current JST window.
  try {
    if (await command(['GET', failure]) === window) {
      return { ...providerResult({ saved: saved?.availability, lastSuccessfulAt: saved?.lastSuccessfulAt }), window, source: 'cooldown' };
    }
  } catch (error) {
    console.error('SHARED PROVIDER COOLDOWN READ FAILED', error);
    return { ...providerResult({ saved: saved?.availability, lastSuccessfulAt: saved?.lastSuccessfulAt }), window, source: 'cache-unavailable' };
  }
  // Atomic lock prevents simultaneous visitors from all hitting TMDB.
  let acquired;
  try { acquired = await command(['SET', lock, window, 'NX', 'EX', LOCK_SECONDS]); }
  catch (error) {
    console.error('SHARED PROVIDER LOCK FAILED', error);
    return { ...providerResult({ saved: saved?.availability, lastSuccessfulAt: saved?.lastSuccessfulAt }), window, source: 'cache-unavailable' };
  }
  if (acquired !== 'OK') {
    return { ...providerResult({ saved: saved?.availability, lastSuccessfulAt: saved?.lastSuccessfulAt }), window, source: 'pending' };
  }
  try {
    const fresh = await load();
    if (!fresh || typeof fresh !== 'object' || Array.isArray(fresh)) {
      throw new Error('Invalid provider response');
    }
    const lastSuccessfulAt = new Date(now).toISOString();
    // A refresh that could not be saved is not shared with later visitors.
    // Return the previous data with a warning rather than claim a successful refresh.
    await command(['SET', data, JSON.stringify({ window, availability: fresh, lastSuccessfulAt })]);
    await safeIssue(() => clearIssue(type, id, 'providers'));
    return { ...providerResult({ fresh }), lastSuccessfulAt, window, source: 'tmdb' };
  } catch (error) {
    try { await command(['SET', failure, window, 'EX', FAILURE_COOLDOWN_SECONDS]); }
    catch (cooldownError) { console.error('SHARED PROVIDER COOLDOWN WRITE FAILED', cooldownError); }
    await safeIssue(() => recordIssue(type, id, 'providers', error));
    return { ...providerResult({ saved: saved?.availability, lastSuccessfulAt: saved?.lastSuccessfulAt }), window, source: 'fallback' };
  } finally {
    // A short lock expiry is safer than unconditional DEL, which could delete
    // a newer worker's lock after this worker stalls.
  }
}
module.exports = { windowId, keys, getSharedProviders };
