'use strict';
// Canonical provider-ledger policy. Pure functions; no Redis/TMDB/network calls.
// One record per (movie|tv, TMDB ID), regardless of how many pages reference it.
const DAY_MS = 24 * 60 * 60 * 1000;
function workKey(type,id) {
  const n=Number(id);
  if (!['movie','tv'].includes(type) || !Number.isSafeInteger(n) || n<=0) throw new Error('Invalid work identity');
  return type+':'+n;
}
function normalizeSeriesIds(ids) {
  if (!Array.isArray(ids)) throw new Error('Invalid series IDs');
  return [...new Set(ids.map(x=>String(x).trim()).filter(Boolean))].sort();
}
function policyFor(seriesIds) {
  return normalizeSeriesIds(seriesIds).length ? 'watch-order-daily-06-jst' : 'on-demand-24h';
}
// At/after 06:00 JST, a watch-order work may refresh once per JST calendar day.
// Before 06:00 JST, its most recent eligible window began yesterday at 06:00.
function jstSixWindow(now) {
  if (!Number.isFinite(now)) throw new Error('Invalid timestamp');
  const jst=new Date(now+9*60*60*1000);
  let start=Date.UTC(jst.getUTCFullYear(),jst.getUTCMonth(),jst.getUTCDate(),-3,0,0);
  if (now<start) start-=DAY_MS;
  return start;
}
function refreshDue(record,now=Date.now()) {
  if (!record) return true;
  const checked=Date.parse(record.checkedAt);
  if (!Number.isFinite(checked) || checked>now+60*1000) return true;
  const seriesIds=normalizeSeriesIds(record.watchOrderSeriesIds||[]);
  if (seriesIds.length) return checked<jstSixWindow(now);
  return now-checked>=DAY_MS;
}
function nextRefreshEligibleAt(record,now=Date.now()) {
  if (!record || !Number.isFinite(Date.parse(record.checkedAt))) return null;
  if (normalizeSeriesIds(record.watchOrderSeriesIds||[]).length) return jstSixWindow(now)+DAY_MS;
  return Date.parse(record.checkedAt)+DAY_MS;
}
function normalizeProviderRecord(type,id,source) {
  if (!source || typeof source!=='object') throw new Error('Invalid provider record');
  const jp=source.data?.results?.JP;
  const results=jp && typeof jp==='object' && !Array.isArray(jp) ? {JP:jp} : {};
  return {
    schemaVersion:1,
    workKey:workKey(type,id),
    watchOrderSeriesIds:normalizeSeriesIds(source.watchOrderSeriesIds||[]),
    data:{results},
    checkedAt:source.checkedAt||null
  };
}
module.exports={workKey,normalizeSeriesIds,policyFor,jstSixWindow,refreshDue,nextRefreshEligibleAt,normalizeProviderRecord};
