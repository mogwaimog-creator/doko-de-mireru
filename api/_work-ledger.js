'use strict';

// Shared work metadata ledger (not streaming availability).
// This module is opt-in: existing pages and API routes are unchanged.
const { command } = require('./_redis');

const PREFIX = 'doko:work:v1';
const MAX_CAST = 30;

function identity(type, id) {
  if (!['movie', 'tv'].includes(type)) throw new Error('Invalid work type');
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) throw new Error('Invalid work ID');
  return { type, id: n, key: `${PREFIX}:${type}:${n}` };
}

function textOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

// Page-specific additions are stored by page key and can grow without changing
// the shared metadata schema. Preserve unknown fields within each page's extras.
function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function normalizePageExtras(value) {
  const extras = {};
  for (const [page, fields] of Object.entries(plainObject(value))) {
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(page)) continue;
    if (fields && typeof fields === 'object' && !Array.isArray(fields)) extras[page] = fields;
  }
  return extras;
}

function normalizeWork(type, id, source) {
  const work = identity(type, id);
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('Invalid work payload');
  }
  const cast = Array.isArray(source.cast) ? source.cast.slice(0, MAX_CAST) : [];
  const record = {
    schemaVersion: 1,
    type: work.type,
    id: work.id,
    title: textOrNull(source.title),
    originalTitle: textOrNull(source.originalTitle),
    releaseDate: textOrNull(source.releaseDate),
    overview: textOrNull(source.overview),
    runtimeMinutes: Number.isFinite(source.runtimeMinutes) ? source.runtimeMinutes : null,
    genres: Array.isArray(source.genres) ? source.genres.slice(0, 20) : [],
    posterPath: textOrNull(source.posterPath),
    backdropPath: textOrNull(source.backdropPath),
    directors: Array.isArray(source.directors) ? source.directors.slice(0, 10) : [],
    cast,
    collectionId: Number.isSafeInteger(source.collectionId) ? source.collectionId : null,
    collectionName: textOrNull(source.collectionName),
    seasons: Array.isArray(source.seasons) ? source.seasons.slice(0, 100) : [],
    status: textOrNull(source.status),
    voteAverage: Number.isFinite(source.voteAverage) ? source.voteAverage : null,
    voteCount: Number.isSafeInteger(source.voteCount) ? source.voteCount : null,
    checkedAt: textOrNull(source.checkedAt) || new Date().toISOString(),
    nextCheckAt: textOrNull(source.nextCheckAt),
    manualReview: source.manualReview === true,
    // ID verification is independent of editorial/metadata checks.
    verification: {
      identity: textOrNull(source.verification?.identity) || 'not_recorded',
      metadata: textOrNull(source.verification?.metadata) || 'not_checked',
      items: plainObject(source.verification?.items),
      notes: textOrNull(source.verification?.notes)
    },
    errors: Array.isArray(source.errors) ? source.errors : [],
    // Supplemental fields per page; not limited to a predefined list.
    pageExtras: normalizePageExtras(source.pageExtras)
  };
  if (!record.title) throw new Error('Work title is required');
  return record;
}

async function getWork(type, id) {
  const { key } = identity(type, id);
  const raw = await command(['GET', key]);
  if (!raw) return null;
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!parsed || parsed.schemaVersion !== 1) return null;
  return parsed;
}

async function putWork(type, id, source) {
  const record = normalizeWork(type, id, source);
  const { key } = identity(type, id);
  await command(['SET', key, JSON.stringify(record)]);
  return record;
}

module.exports = { identity, normalizeWork, getWork, putWork };
