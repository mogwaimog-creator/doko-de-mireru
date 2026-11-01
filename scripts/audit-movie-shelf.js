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

function compareEditorialSources(previous, current) {
  const names = ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories'];
  return Object.fromEntries(names.map(name => {
    const oldHash = previous?.[name];
    const newHash = current?.[name];
    return [name, !oldHash ? 'untracked' : oldHash === newHash ? 'unchanged' : 'changed'];
  }));
}

function editorialEntryFingerprints(html) {
  const names = ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories'];
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const out = {};
  for (const name of names) {
    const block = extractLiteral(html, name);
    if (name === 'memoryFilms') {
      // Use stable IDs where available; include the title to expose accidental ID collisions.
      out[name] = Object.fromEntries(block.map((entry, index) => [
        entry.id ? 'movie:' + entry.id + ':' + entry.title : 'unverified:' + index + ':' + entry.title,
        digest(entry)
      ]));
    } else {
      out[name] = Object.fromEntries(Object.entries(block).map(([title, entry]) => [title, digest(entry)]));
    }
  }
  return out;
}

function resolveEditorialTitleIds(html) {
  const memory = extractLiteral(html, 'memoryFilms');
  const overrides = extractLiteral(html, 'classicKnownIds');
  const sections = ['verifiedClassicInfo', 'approvedAwardStories'];
  const memoryIds = new Map();
  for (const item of memory) {
    if (!memoryIds.has(item.title)) memoryIds.set(item.title, new Set());
    if (Number.isSafeInteger(item.id) && item.id > 0) memoryIds.get(item.title).add(item.id);
  }
  const resolved = {}, needsReview = [];
  for (const section of sections) {
    const block = extractLiteral(html, section);
    resolved[section] = {};
    for (const title of Object.keys(block)) {
      const candidates = new Set(memoryIds.get(title) || []);
      const fixed = overrides[title];
      if (Number.isSafeInteger(fixed) && fixed > 0) candidates.add(fixed);
      // Explicit IDs in editorial records are authoritative candidates too.
      // Disagreement with the other sources remains blocked for review.
      const embedded = block[title]?.id;
      if (Number.isSafeInteger(embedded) && embedded > 0) candidates.add(embedded);
      if (candidates.size === 1) resolved[section][title] = [...candidates][0];
      else needsReview.push({ section, title, reason: candidates.size ? 'conflicting-ids' : 'missing-id', candidates: [...candidates] });
    }
  }
  return { resolved, needsReview, writes: 0 };
}

function buildEditorialSnapshot(html) {
  const sections = {};
  for (const name of ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories']) {
    const value = extractLiteral(html, name);
    sections[name] = JSON.parse(JSON.stringify(value));
  }
  return { schemaVersion: 1, sources: sections, fingerprints: editorialEntryFingerprints(html) };
}

function planEditorialMigration(previous, current) {
  const changes = compareEditorialEntries(previous, current);
  const plan = {};
  for (const [section, delta] of Object.entries(changes)) {
    plan[section] = {
      // A change report is not authorization to overwrite stored editorial text.
      reviewBeforeImport: [...delta.added, ...delta.changed],
      missingFromSource: delta.removed,
      autoWrites: 0
    };
  }
  return plan;
}

function compareEditorialEntries(previous, current) {
  const changes = {};
  for (const name of ['memoryFilms', 'verifiedClassicInfo', 'approvedAwardStories']) {
    const before = previous?.[name] || {};
    const after = current?.[name] || {};
    changes[name] = {
      added: Object.keys(after).filter(key => !(key in before)),
      changed: Object.keys(after).filter(key => key in before && after[key] !== before[key]),
      removed: Object.keys(before).filter(key => !(key in after))
    };
  }
  return changes;
}

function audit(html) {
  const memory = extractLiteral(html, 'memoryFilms');
  const verified = extractLiteral(html, 'verifiedClassicInfo');
  const stories = extractLiteral(html, 'approvedAwardStories');
  const ids = extractLiteral(html, 'classicKnownIds');
  const names = new Set(memory.map(x => x.title));
  const duplicates = [...names].filter(title => memory.filter(x => x.title === title).length > 1);
  const invalidIds = memory.filter(x => x.id != null && (!Number.isSafeInteger(x.id) || x.id <= 0)).map(x => x.title);
  const titlesById = new Map();
  for (const entry of memory) {
    if (!Number.isSafeInteger(entry.id) || entry.id <= 0) continue;
    const titles = titlesById.get(entry.id) || new Set();
    titles.add(entry.title);
    titlesById.set(entry.id, titles);
  }
  const conflictingIds = [...titlesById].filter(([, titles]) => titles.size > 1)
    .map(([id, titles]) => ({ id, titles: [...titles] }));
  const missingIds = memory.filter(entry => entry.id == null).map(entry => entry.title);
  // A fixed override must not silently disagree with a memory-film ID.
  const overrideIdConflicts = memory.filter(entry =>
    Number.isSafeInteger(entry.id) && entry.id > 0 &&
    Number.isSafeInteger(ids[entry.title]) && ids[entry.title] > 0 &&
    entry.id !== ids[entry.title]
  ).map(entry => ({ title: entry.title, memoryId: entry.id, overrideId: ids[entry.title] }));
  // Editorial titles from award/history sections may not appear in memoryFilms.
  // Report them separately; absence from one section is not a deletion instruction.
  const titleGroups = {
    memoryFilms: [...names],
    verifiedClassicInfo: Object.keys(verified),
    approvedAwardStories: Object.keys(stories)
  };
  const editorialOnlyTitles = [...new Set([
    ...titleGroups.verifiedClassicInfo,
    ...titleGroups.approvedAwardStories
  ])].filter(title => !names.has(title));
  const unlinkedEditorialTitles = editorialOnlyTitles.filter(title =>
    !Number.isSafeInteger(ids[title]) || ids[title] <= 0);
  return {
    memoryFilms: memory.length,
    verifiedDescriptions: Object.keys(verified).length,
    awardStoryEntries: Object.keys(stories).length,
    fixedIdOverrides: Object.keys(ids).length,
    duplicateMemoryTitles: duplicates,
    invalidMemoryIds: Array.from(invalidIds),
    conflictingMemoryIds: conflictingIds,
    overrideIdConflicts,
    missingMemoryIds: missingIds,
    editorialOnlyTitles,
    unlinkedEditorialTitles,
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
module.exports = { extractLiteral, editorialFingerprints, compareEditorialSources, editorialEntryFingerprints, compareEditorialEntries, planEditorialMigration, buildEditorialSnapshot, resolveEditorialTitleIds, audit };
