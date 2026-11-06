'use strict';
const assert=require('node:assert/strict');
const {makeRewrites}=require('./build-seo-vercel-routes');
const manifest=[
 {url:'/detail.html?id=157336',file:'movie-157336.html'},
 {url:'/detail.html?id=157336&type=tv',file:'tv-157336.html'},
 {url:'/person.html?id=1813',file:'person-1813.html'}
];
const routes=makeRewrites(manifest);
assert.equal(routes.length,4);
assert.equal(routes[0].source,'/detail.html');
assert.equal(routes[0].destination,'/seo-static/movie-157336.html');
assert.deepEqual(routes[0].has,[{type:'query',key:'id',value:'157336'},{type:'query',key:'type',value:'movie'}]);
assert.deepEqual(routes[1].missing,[{type:'query',key:'type'}]);
assert.equal(routes[2].destination,'/seo-static/tv-157336.html');
assert.equal(routes[3].destination,'/seo-static/person-1813.html');
assert.throws(()=>makeRewrites([{url:'/detail.html?id=1',file:'tv-1.html'}]),/mismatch/);
assert.throws(()=>makeRewrites([...manifest,manifest[0]]),/Duplicate/);
assert.throws(()=>makeRewrites([{url:'/detail.html?id=1',file:'movie-1.html/../x'}]),/filename/);
console.log('SEO static rewrite generator tests passed');
