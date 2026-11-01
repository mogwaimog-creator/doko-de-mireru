'use strict';
// Generates a local-only HTML comparison fixture. Does not change the source
// page, contact TMDB, use Redis, or deploy to Vercel.
const fs = require('node:fs');
const path = require('node:path');
const { extractLiteral } = require('./audit-movie-shelf');
const { researchPreview, toLedgerCandidate } = require('./preview-movie-shelf-ledger');
const { normalizeWork } = require('../api/_work-ledger');

function build() {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'movie_shelf_1980_1984.html'), 'utf8');
  const diagnostic = fs.readFileSync(path.join(root, 'shelf-check.html'), 'utf8');
  const candidates = researchPreview(html, diagnostic).records;
  const normalized = candidates.map(record => {
    const input = toLedgerCandidate(record);
    return JSON.parse(JSON.stringify(normalizeWork(input.type, input.id, input)));
  });
  const byTitle = new Map(normalized.map(record => [
    record.title, record.pageExtras.movieShelf
  ]));
  const sourceMemory = extractLiteral(html, 'memoryFilms');
  const memory = sourceMemory.map(item => byTitle.get(item.title)?.memoryFilms);
  if (memory.length !== sourceMemory.length ||
      memory.some((item, i) => JSON.stringify(item) !== JSON.stringify(sourceMemory[i])))
    throw Error('Local comparison fixture failed editorial equivalence');
  // The award and film-history sections must also survive normalization
  // without losing a title, editorial field, or source insertion order.
  for (const section of ['verifiedClassicInfo', 'approvedAwardStories']) {
    const source = extractLiteral(html, section);
    const reconstructed = Object.fromEntries(Object.keys(source).map(title => [
      title, byTitle.get(title)?.[section]
    ]));
    if (JSON.stringify(reconstructed) !== JSON.stringify(source))
      throw Error('Local comparison fixture failed ' + section + ' editorial equivalence');
  }
  // Reconstruct all three editorial data literals from normalized ledger
  // candidates. This is still a comparison fixture, never a production edit.
  let compared = html;
  for (const [section, data] of [
    ['memoryFilms', memory],
    ...['verifiedClassicInfo', 'approvedAwardStories'].map(section => [
      section,
      Object.fromEntries(Object.keys(extractLiteral(html, section)).map(title => [
        title, byTitle.get(title)?.[section]
      ]))
    ])
  ]) {
    const source = extractLiteral(html, section);
    const original = 'const ' + section + '=' + JSON.stringify(source) + ';';
    if (!compared.includes(original))
      throw Error('Original ' + section + ' data anchor not found');
    compared = compared.replace(original, 'const ' + section + '=' + JSON.stringify(data) + ';');
  }
  // A banner differentiates the local fixture from the published page.
  const banner = '<div role="note" style="padding:12px;background:#fff3cd;color:#333;text-align:center;font-size:16px">開発用・台帳復元表示確認（本番サイトではありません）</div>';
  // The original page fetches posters from the production API when opened as a
  // file:// URL. Keep every comparison run offline to avoid real API/CDN usage.
  // Browser tests inject a deterministic image separately when needed.
  const offlineGuard = '<script>window.fetch=function(){return Promise.reject(new Error("Offline comparison fixture: network requests disabled"));};</script>';
  if (!html.includes('</head>')) throw Error('HTML head anchor not found');
  return compared.replace('</head>', offlineGuard + '</head>')
    .replace('<body>', '<body>' + banner);
}
if (require.main === module) {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output))
    throw Error('Specify an absolute local output HTML path');
  fs.writeFileSync(output, build(), 'utf8');
  console.log('Local comparison HTML created: ' + output);
}
module.exports = { build };
