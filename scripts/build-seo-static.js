'use strict';
// Offline-only prototype. Does not change routes, cron jobs or runtime API behavior.
// Usage: node scripts/build-seo-static.js input.json output-directory
const fs = require('node:fs/promises');
const path = require('node:path');
const {injectSeo} = require('../api/_seo-initial-html');

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') throw Error('Invalid record');
  if (record.kind === 'person') {
    const id = Number(record.id);
    if (!Number.isSafeInteger(id) || id <= 0 || !/^\d+$/.test(String(record.id))) throw Error('Invalid person ID');
    return {kind:'person', id, name:record.name};
  }
  // Accept the existing shared work-ledger schema without copying fields by hand.
  // This is an offline JSON export, never a live Redis or TMDB request.
  if (record.kind !== 'work' && !(record.schemaVersion === 1 && ['movie','tv'].includes(record.type))) throw Error('Invalid work kind/type');
  if (!['movie','tv'].includes(record.type)) throw Error('Invalid work type');
  const id = Number(record.id);
  if (!Number.isSafeInteger(id) || id <= 0 || !/^\d+$/.test(String(record.id))) throw Error('Invalid work ID');
  return {kind:'work', type:record.type, id, title:record.title};
}
function filename(record) {
  return record.kind === 'person' ? 'person-' + record.id + '.html' : record.type + '-' + record.id + '.html';
}
async function build(input, output, templateRoot = path.join(__dirname, '..')) {
  const records = JSON.parse(await fs.readFile(input,'utf8'));
  if (!Array.isArray(records)) throw Error('Expected an array of ledger records');
  const detail = await fs.readFile(path.join(templateRoot,'detail.html'),'utf8');
  const person = await fs.readFile(path.join(templateRoot,'person.html'),'utf8');
  // Validate all records and detect duplicates before writing anything.
  const pages = [];
  const seen = new Set();
  for (const raw of records) {
    const record = normalizeRecord(raw);
    const name = filename(record);
    if (seen.has(name)) throw Error('Duplicate page: ' + name);
    seen.add(name);
    const html = injectSeo(record.kind === 'person' ? person : detail, record.kind, record);
    pages.push({name, html});
  }
  await fs.mkdir(output,{recursive:true});
  for (const page of pages) {
    const target = path.join(output,page.name);
    const temporary = target + '.tmp';
    await fs.writeFile(temporary,page.html,'utf8');
    await fs.rename(temporary,target);
  }
  return pages.map(page=>page.name);
}
if (require.main === module) {
  const [, , input, output] = process.argv;
  if (!input || !output) {
    console.error('Usage: node scripts/build-seo-static.js input.json output-directory');
    process.exitCode = 2;
  } else {
    build(path.resolve(input),path.resolve(output)).then(
      names=>console.log('Generated ' + names.length + ' static SEO pages'),
      error=>{console.error(error.message);process.exitCode=1;}
    );
  }
}
module.exports={build,normalizeRecord,filename};
