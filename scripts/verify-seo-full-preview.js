'use strict';
// Offline structural acceptance tests for the full-site preview artifact.
// Does not claim HTTP routing correctness or deploy anything.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(process.argv[2]||'/tmp/doko-seo-full-preview');
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const config=JSON.parse(read('vercel.json'));
assert.equal(config.rewrites.length,7,'expected six SEO rules plus preserved legacy route');
assert.ok(config.rewrites.some(r=>r.source==='/movie/:id'&&r.destination==='/index.html'),'original movie route missing');
assert.equal(config.functions?.['api/seo-html-pilot.js']?.includeFiles,'{detail-fallback.html,person-fallback.html}','function includeFiles must follow relocated templates');
assert.equal(config.crons,undefined,'preview must not schedule production cron');
for(const file of ['index.html','api/search.js','detail-fallback.html','person-fallback.html','seo-pages/movie-50014.html','seo-pages/tv-202879.html','seo-pages/person-1134684.html'])assert.ok(fs.existsSync(path.join(root,file)),'missing '+file);
for(const file of ['detail.html','person.html'])assert.ok(!fs.existsSync(path.join(root,file)),'physical template shadows rewrites: '+file);
const seo=config.rewrites.filter(r=>r.destination.startsWith('/seo-pages/'));
assert.equal(seo.length,4);
const movie=seo.filter(r=>r.destination==='/seo-pages/movie-50014.html');
assert.equal(movie.length,2,'movie needs typed and untyped routes');
assert.ok(movie.some(r=>r.missing?.some(m=>m.key==='type')));
assert.ok(movie.some(r=>r.has?.some(h=>h.key==='type'&&h.value==='movie')));
const tv=seo.find(r=>r.destination==='/seo-pages/tv-202879.html');
assert.ok(tv?.has?.some(h=>h.key==='type'&&h.value==='tv'));
assert.ok(seo.every(r=>r.has?.some(h=>h.key==='id')),'no broad record rewrite');
assert.ok(!seo.some(r=>r.destination.includes('/api/')),'no per-hit SEO API renderer');
assert.ok(config.rewrites.some(r=>r.source==='/detail.html'&&r.destination==='/detail-fallback.html'));
assert.ok(config.rewrites.some(r=>r.source==='/person.html'&&r.destination==='/person-fallback.html'));
for(const file of ['movie-50014.html','tv-202879.html','person-1134684.html']){
 const html=read('seo-pages/'+file);
 assert.match(html,/<title>[^<]+<\/title>/i,'missing initial title: '+file);
 assert.match(html,/rel=["']canonical["']/i,'missing canonical: '+file);
 assert.match(html,/<h1\b/i,'missing heading: '+file);
}
console.log('Offline full-site preview structural acceptance passed. HTTP routing still unverified; not deployed.');
