'use strict';
// Read-only audit of the existing movie shelf editorial source.
// Run: node scripts/audit-movie-shelf.js
// This never calls TMDB, Redis, or a production endpoint.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

function extractLiteral(html, name) {
  const marker = 'const ' + name + '=';
  const start = html.indexOf(marker);
  if (start < 0) throw Error('Missing source block: ' + name);
  const pos = start + marker.length;
  const opener = html[pos];
  if (opener !== '{' && opener !== '[') throw Error('Unexpected source block: ' + name);
  const stack = [];
  let quote = null, escaped = false, end = -1;
  for (let i = pos; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') {
      const opening = stack.pop();
      if (opening !== (c === '}' ? '{' : '[')) throw Error('Unbalanced ' + name);
      if (!stack.length) { end = i + 1; break; }
    }
  }
  if (end < 0) throw Error('Unclosed source block: ' + name);
  return vm.runInNewContext('(' + html.slice(pos, end) + ')', Object.create(null), { timeout: 1000 });
}

function editorialFingerprints(html) {
  return Object.fromEntries(['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories'].map(name => {
    const value = extractLiteral(html, name);
    // Stable for source formatting changes; changes when the actual text changes.
    const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    return [name, digest];
  }));
}

function audit(html) {
  const memory = extractLiteral(html, 'memoryFilms');
  const verified = extractLiteral(html, 'verifiedClassicInfo');
  const stories = extractLiteral(html, 'approvedAwardStories');
  const ids = extractLiteral(html, 'classicKnownIds');
  const names = new Set(memory.map(x => x.title));
  const duplicates = [...names].filter(title => memory.filter(x => x.title === title).length > 1);
  const invalidIds = memory.filter(x => x.id != null && (!Number.isSafeInteger(x.id) || x.id <= 0)).map(x => x.title);
  return {
    memoryFilms: memory.length,
    verifiedDescriptions: Object.keys(verified).length,
    awardStoryEntries: Object.keys(stories).length,
    fixedIdOverrides: Object.keys(ids).length,
    duplicateMemoryTitles: duplicates,
    invalidMemoryIds: Array.from(invalidIds),
    // All three blocks are retained independently, even for the same title.
    editorialSources: ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories'],
    editorialFingerprints: editorialFingerprints(html),
    sample: {
      title: memory[0]?.title,
      summaryPresent: Boolean(memory[0]?.summary),
      memoryPresent: Boolean(memory[0]?.memory)
    }
  };
}

if (require.main === module) {
  const html = fs.readFileSync(path.join(__dirname, '../movie_shelf_1980_1984.html'), 'utf8');
  console.log(JSON.stringify(audit(html), null, 2));
}
module.exports = { extractLiteral, editorialFingerprints, audit };
