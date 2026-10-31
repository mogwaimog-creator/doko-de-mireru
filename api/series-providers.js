'use strict';
// Subscription-only provider endpoint for series cards.
// Opt-in: without SHARED_PROVIDER_ENABLED=1 the caller uses its legacy route.
const { identity } = require('./_work-ledger');
const { detailProviders } = require('./_detail-providers');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({error:'GET only'});
  if (process.env.SHARED_PROVIDER_ENABLED !== '1') return res.status(404).json({error:'Shared providers disabled'});
  let work;
  try { work = identity(req.query?.type, req.query?.id); }
  catch (_) { return res.status(400).json({error:'Invalid work identity'}); }
  const token = process.env.TMDB_API_KEY || process.env.TMDB_API_TOKEN;
  if (!token) return res.status(503).json({error:'Provider service unavailable'});
  const url = 'https://api.themoviedb.org/3/' + work.type + '/' + work.id + '/watch/providers';
  const load = async () => {
    const headers = process.env.TMDB_API_TOKEN ? {Authorization:'Bearer '+process.env.TMDB_API_TOKEN} : {};
    const endpoint = process.env.TMDB_API_TOKEN ? url : url+'?api_key='+encodeURIComponent(process.env.TMDB_API_KEY);
    const response = await fetch(endpoint,{headers});
    if (!response.ok) throw new Error('TMDB providers HTTP '+response.status);
    return response.json();
  };
  try {
    const result = await detailProviders(work.type, work.id, load);
    const all = result.availability?.flatrate;
    return res.status(200).json({
      streaming: Array.isArray(all) ? all.filter(p=>p&&Number.isSafeInteger(p.provider_id)&&typeof p.logo_path==='string') : [],
      provider_status: {
        stale:result.stale===true,unavailable:result.unavailable===true,
        warning:result.warning||null,lastSuccessfulAt:result.lastSuccessfulAt||null
      }
    });
  } catch (error) {
    console.error('SERIES PROVIDERS FAILED',error);
    return res.status(503).json({error:'配信情報を確認できません'});
  }
};
