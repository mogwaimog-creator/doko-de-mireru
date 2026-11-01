'use strict';
// Read-only TMDB identity verification for movie-shelf research candidates.
// Usage: TMDB_READ_ACCESS_TOKEN=... node scripts/verify-movie-shelf-tmdb.js
// Never prints the token, writes files, calls Redis, or edits the website.
const fs = require('node:fs');
const path = require('node:path');
const { researchedIdCandidates } = require('./preview-movie-shelf-ledger');
const catalogHtml = fs.readFileSync(path.join(__dirname, '../shelf-check.html'), 'utf8');
const match = catalogHtml.match(/const items=(\[[\s\S]*?\]);\s*const known=/);
if (!match) throw Error('Diagnostic catalog not found');
const catalog = JSON.parse(match[1]);
const normalize = text => String(text || '').normalize('NFKC').toLowerCase()
  .replace(/[’‘\u2019]/g, "'").replace(/[^\p{L}\p{N}]+/gu, '');
const token = process.env.TMDB_READ_ACCESS_TOKEN || process.env.TMDB_API_READ_ACCESS_TOKEN;
const apiKey = process.env.TMDB_API_KEY;
if (!token && !apiKey) {
  console.error('TMDB credentials missing. Set TMDB_READ_ACCESS_TOKEN or TMDB_API_KEY. No requests sent.');
  process.exitCode = 2;
} else {
  (async () => {
    const results = [];
    for (const [title, id] of Object.entries(researchedIdCandidates)) {
      const item = catalog.find(x => x.title === title);
      if (!item) throw Error('Missing diagnostic catalog entry: ' + title);
      const url = new URL('https://api.themoviedb.org/3/movie/' + id);
      url.searchParams.set('language', 'en-US');
      if (!token) url.searchParams.set('api_key', apiKey);
      let data;
      try {
        const response = await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
        if (!response.ok) {
          results.push({ title, id, status: 'http-error', httpStatus: response.status });
          if (response.status === 401 || response.status === 403 || response.status === 429) break;
          continue;
        }
        data = await response.json();
      } catch (error) {
        results.push({ title, id, status: 'network-error', reason: error.name });
        break;
      }
      const expected = normalize(item.original);
      const actual = [data.original_title, data.title].map(normalize);
      // Catalog labels sometimes contain both the English title and original
      // title in parentheses. Require BOTH names to match the TMDB record.
      const bilingual = item.original.match(/^(.+?)\s*\(([^()]+)\)$/);
      const titleMatch = bilingual
        ? [bilingual[1], bilingual[2]].every(part => actual.includes(normalize(part)))
        : actual.includes(expected);
      const productionYear = Number(String(data.release_date || '').slice(0, 4)) || null;
      // Catalog year may be Japan release, festival, or award year.
      const yearDifference = productionYear == null ? null : Math.abs(productionYear - item.year);
      const status = data.id !== id || !titleMatch ? 'manual-review'
        : yearDifference !== null && yearDifference > 2 ? 'manual-review' : 'identity-match';
      results.push({ title, id, expectedOriginal: item.original,
        tmdbOriginal: data.original_title, tmdbTitle: data.title,
        catalogYear: item.year, tmdbReleaseDate: data.release_date,
        titleMatch, yearDifference, status });
    }
    console.log(JSON.stringify({ mode:'read-only', productionWrites:0,
      checked:results.length, expected: Object.keys(researchedIdCandidates).length,
      identityMatches:results.filter(x=>x.status==='identity-match').length,
      manualReview:results.filter(x=>x.status!=='identity-match').length,
      results }, null, 2));
    if (results.length !== Object.keys(researchedIdCandidates).length ||
        results.some(x=>x.status!=='identity-match')) process.exitCode = 1;
  })().catch(error => { console.error('Verification aborted: ' + error.message); process.exitCode = 1; });
}
