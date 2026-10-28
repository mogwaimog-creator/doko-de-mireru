// ミニオンズ専用：日本国内の見放題情報をまとめて取得するAPI。
// 同一URLへのアクセスはVercel CDNで24時間キャッシュします。
const MOVIES = [20352, 93456, 211672, 324852, 438148, 519182, 1315772];
const TIMEOUT_MS = 9000;

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(405).json({ error: 'GETのみ対応しています。' });
  }
  if (!process.env.TMDB_API_KEY) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    return res.status(503).json({ error: '配信情報を取得できません。' });
  }
  try {
    const items = await Promise.all(MOVIES.map(async (id) => {
      const url = `https://api.themoviedb.org/3/movie/${id}/watch/providers?api_key=${encodeURIComponent(process.env.TMDB_API_KEY)}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) throw new Error(`TMDB ${id}: ${response.status}`);
      const data = await response.json();
      if (!data || typeof data.results !== 'object' || data.results === null) {
        throw new Error(`Invalid provider response: ${id}`);
      }
      const jp = data.results.JP || {};
      return { id, streaming: Array.isArray(jp.flatrate) ? jp.flatrate.map(p => ({
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        logo_path: p.logo_path
      })) : [] };
    }));
    // 7作品の取得が全て成功した場合に限りキャッシュする。
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=86400, stale-while-revalidate=3600');
    return res.status(200).json({ checkedAt: new Date().toISOString(), items });
  } catch (error) {
    console.error('MINIONS STREAMING ERROR:', error);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    return res.status(503).json({ error: '配信情報の取得に失敗しました。' });
  }
};
