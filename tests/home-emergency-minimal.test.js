'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
test('emergency discovery is reversible and popular loading is guarded at startup and entry',()=>{
 assert.match(html,/<html[^>]*data-emergency-minimal="1"/);
 for(const id of ['providerSearchSection','advancedSearchSection'])assert.match(html,new RegExp('id="'+id+'"\\s+data-emergency-discovery'));
 assert.match(html,/class="popular-section"\s+data-emergency-discovery/);
 assert.match(html,/html\[data-emergency-minimal="1"\] \[data-emergency-discovery\]/);
 assert.match(html,/async function loadPopularMovies\(\)\{\s*if\(emergencyMinimalMode\)return;/);
 assert.match(html,/if\(!emergencyMinimalMode\)loadPopularMovies\(\);/);
 assert.match(html,/if\(advancedSearchSubmit && !emergencyMinimalMode\)/);
});
test('title search and feature navigation remain, with correct TV and anime detail links',()=>{
 for(const type of ['movie','drama','anime'])assert(html.includes('data-type="'+type+'"'));
 for(const href of ['mcu.html','godzilla.html','eva.html','series.html','./ghibli.html','./movie_shelf_1980_1984.html'])assert(html.includes('href="'+href+'"'));
 const series=fs.readFileSync(require.resolve('../series.html'),'utf8');
 for(const name of Object.keys(require('../data/watch-order-memberships.json')))assert(series.includes('href="'+name+'.html"'));
 assert.match(html,/\["tv", "tv_drama", "anime_tv"\]\.includes\(movie.content_type\)/);
});
test('homepage SEO elements are byte-identical to PR 46 before emergency UI changes',()=>{
 const before=execFileSync('git',['show','1056ec957267bcae179766608802ef4a55be0b64:index.html'],{encoding:'utf8'});
 const seo=source=>[...source.matchAll(/<title\b[^>]*>[\s\S]*?<\/title>|<h1\b[^>]*>[\s\S]*?<\/h1>|<link\b[^>]*rel="canonical"[^>]*>|<script\b[^>]*type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/g)].map(x=>x[0]);
 assert(seo(html).length>=4);assert.deepEqual(seo(html),seo(before));
});
