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
  const original = 'const memoryFilms=' + JSON.stringify(sourceMemory) + ';';
  if (!html.includes(original)) throw Error('Original memory data anchor not found');
  const replacement = 'const memoryFilms=' + JSON.stringify(memory) + ';';
  // A banner differentiates the local fixture from the published page.
  const banner = '<div role="note" style="padding:12px;background:#fff3cd;color:#333;text-align:center;font-size:16px">開発用・台帳復元表示確認（本番サイトではありません）</div>';
  return html.replace('<body>', '<body>' + banner).replace(original, replacement);
}
if (require.main === module) {
  const output = process.argv[2];
  if (!output || !path.isAbsolute(output))
    throw Error('Specify an absolute local output HTML path');
  fs.writeFileSync(output, build(), 'utf8');
  console.log('Local comparison HTML created: ' + output);
}
module.exports = { build };
