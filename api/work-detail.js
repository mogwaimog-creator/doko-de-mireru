'use strict';

// Experimental metadata-only endpoint. Does not replace /api/search or
// touch existing doko:watch:* streaming keys.
// GET /api/work-detail?type=movie&id=123
const { getWork, putWorkIfAbsent, identity } = require('./_work-ledger');
const { fromTmdb } = require('./_work-from-tmdb');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  const { type, id } = req.query || {};
  let work;
  try {
    work = identity(type, id);
  } catch (_) {
    return res.status(400).json({ error: 'Invalid type or ID' });
  }

  // Redis failure must not prevent a legitimate visitor from seeing metadata.
  try {
    const cached = await getWork(work.type, work.id);
    if (cached) return res.status(200).json({ source: 'ledger', work: cached });
  } catch (error) {
    console.error('WORK LEDGER READ ERROR', error);
  }

  const key = process.env.TMDB_API_KEY;
  if (!key) return res.status(503).json({ error: 'TMDB unavailable' });
  try {
    const url = new URL(`https://api.themoviedb.org/3/${work.type}/${work.id}`);
    url.searchParams.set('api_key', key);
    url.searchParams.set('language', 'ja-JP');
    url.searchParams.set('append_to_response', 'credits');
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return res.status(response.status === 404 ? 404 : 502)
        .json({ error: 'Work metadata could not be retrieved' });
    }
    const raw = await response.json();
    if (Number(raw.id) !== work.id) throw new Error('TMDB ID mismatch');
    const metadata = fromTmdb(work.type, raw);

    // Persist only after a successful, validated TMDB response.
    // If Redis is down, return the work anyway. Never cache failures.
    let record;
    try {
      record = await putWorkIfAbsent(work.type, work.id, metadata);
    } catch (error) {
      console.error('WORK LEDGER WRITE ERROR', error);
      record = { ...metadata, id: work.id, type: work.type };
    }
    return res.status(200).json({ source: 'tmdb', work: record });
  } catch (error) {
    console.error('WORK METADATA ERROR', error);
    return res.status(502).json({ error: 'Work metadata temporarily unavailable' });
  }
};
