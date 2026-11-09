'use strict';
// Offline, bounded TMDB ID request list. No TMDB/Redis calls or production writes.
// Usage: node scripts/prepare-id-request-list.js <ids.json> <output.json>
// Input: [{"type":"movie","id":550}, {"type":"tv","id":1399}]
const fs = require('node:fs');
const path = require('node:path');
function prepare(input) {
  if (!Array.isArray(input) || input.length > 500) throw Error('Expected an array of at most 500 IDs');
  const unique = new Map();
  for (const entry of input) {
    if (!entry || !['movie', 'tv'].includes(entry.type) || !Number.isSafeInteger(entry.id) || entry.id < 1) {
      throw Error('Each entry requires type=movie|tv and a positive integer TMDB id');
    }
    unique.set(entry.type + ':' + entry.id, {type: entry.type, id: entry.id});
  }
  return {version: 1, mode: 'manual-approval-only', automaticFetchingEnabled: false,
    requests: [...unique.values()], count: unique.size};
}
function main(args = process.argv.slice(2)) {
  const [source, destination] = args;
  if (!source || !destination || args.length !== 2) throw Error('Usage: node scripts/prepare-id-request-list.js <ids.json> <output.json>');
  const inPath = path.resolve(source), outPath = path.resolve(destination);
  if (inPath === outPath || fs.statSync(inPath).size > 65536) throw Error('Invalid input/output or oversized list');
  const prepared = prepare(JSON.parse(fs.readFileSync(inPath, 'utf8')));
  fs.writeFileSync(outPath, JSON.stringify(prepared, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({output: outPath, count: prepared.count, networkCalls: 0, redisWrites: 0}));
}
if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
module.exports = {prepare};
