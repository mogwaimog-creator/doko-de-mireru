'use strict';
// Offline-only prototype. Does not change routes, cron jobs or runtime API behavior.
// Usage: node scripts/build-seo-static.js input.json output-directory
const fs = require('node:fs/promises');
const path = require('node:path');
const {injectSeo} = require('../api/_seo-initial-html');
const {embedFixedMetadata} = require('./embed-seo-fixed-detail');
const {readFileSync} = require('node:fs');
const fixedReaderSource = readFileSync(path.join(__dirname,'read-seo-fixed-detail.js'),'utf8');
const splitContractSource = readFileSync(path.join(__dirname,'seo-detail-response-contract.js'),'utf8');

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
// Apply identity only to the generated HTML copy; the live templates stay unchanged.
// Existing query parameters still work, but a conflicting ID fails closed.
function injectStaticIdentity(html, record) {
  const anchor = record.kind === 'person' ? 'const personId =' : 'const movieId =';
  const count = html.split(anchor).length - 1;
  if (count !== 1) throw Error('Expected one identity anchor, got ' + count);
  const id = String(record.id);
  const type = record.kind === 'person' ? 'person' : record.type;
  const snippet = '\nconst staticSeoId = ' + JSON.stringify(id) + ';\n' +
    'const staticSeoType = ' + JSON.stringify(type) + ';\n' +
    'if (params.has("id") && params.get("id") !== staticSeoId) throw new Error("Static SEO identity mismatch");\n' +
    'if (params.has("type") && params.get("type") !== staticSeoType) throw new Error("Static SEO type mismatch");\n' +
    'params.set("id", staticSeoId);\n' +
    (record.kind === 'person' ? '' : 'params.set("type", staticSeoType);\n');
  return html.replace(anchor, () => snippet + anchor);
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
    let html = injectStaticIdentity(injectSeo(record.kind === 'person' ? person : detail, record.kind, record), record);
    // Only complete shared ledger records can carry an embedded fixed payload.
    // Legacy sample records remain SEO-only; no provider data is embedded.
    if (record.kind === 'work' && raw.schemaVersion === 1 && raw.extensions?.tmdbDetail) {
      html = embedFixedMetadata(html, raw);
      // Expose a read-only parser to the generated page. Do not alter the
      // existing API request until the provider-only path is implemented.
      // Opt-in split response is served by the SAME existing API request.
      // Reassemble the original response before calling renderMovie().
      // This is a compatibility bridge, not a reduction in API requests yet.
      const requestAnchor = 'encodeURIComponent(\n    mediaType\n  );';
      if (!html.includes(requestAnchor)) throw Error('Missing detail API URL anchor');
      html = html.replace(requestAnchor, requestAnchor + '\n    const splitDetailRequest = true;');
      const fetchAnchor = '        url,\n        {';
      if (!html.includes(fetchAnchor)) throw Error('Missing detail fetch anchor');
      html = html.replace(fetchAnchor, '        (splitDetailRequest ? url + "&detailFormat=split" : url),\n        {');
      const parseAnchor = '    renderMovie(\n      movie\n    );';
      if (!html.includes(parseAnchor)) throw Error('Missing detail render anchor');
      html = html.replace(parseAnchor, '    if (splitDetailRequest) {\n      if (!movie.fixed || !movie.dynamic) throw new Error("Incomplete split detail response");\n      movie = dokoMergeDetailResponse(movie.fixed, movie.dynamic);\n    }\n\n' + parseAnchor);
      const browserContract = splitContractSource.replace('module.exports={splitDetailResponse,mergeDetailResponse,PROVIDER_FIELDS,DYNAMIC_FIELDS};', 'window.dokoMergeDetailResponse=mergeDetailResponse;');
      html = html.replace('</head>', '<script>'+fixedReaderSource+'\n'+browserContract+'</script>\n</head>');
    }
    pages.push({name, html});
  }
  await fs.mkdir(output,{recursive:true});
  for (const page of pages) {
    const target = path.join(output,page.name);
    const temporary = target + '.tmp';
    await fs.writeFile(temporary,page.html,'utf8');
    await fs.rename(temporary,target);
  }
  // Explicit mapping for a future routing layer. No production rewrites are installed.
  // Preserve the query-based canonical URLs used by the current detail/person JS.
  const manifest = pages.map(page => {
    const match = /^(movie|tv|person)-(\d+)\.html$/.exec(page.name);
    const type = match[1], id = match[2];
    const url = type === 'person' ? '/person.html?id=' + id : '/detail.html?id=' + id + (type === 'tv' ? '&type=tv' : '');
    return {url, file:page.name};
  });
  await fs.writeFile(path.join(output,'seo-route-manifest.json'),JSON.stringify(manifest,null,2)+'\n','utf8');
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
module.exports={build,normalizeRecord,filename,injectStaticIdentity};
