'use strict';
const assert=require('node:assert/strict');
const {resolveSeoPage}=require('./resolve-seo-page');
const files=new Set(['movie-157336.html','tv-157336.html','person-1813.html']);
assert.equal(resolveSeoPage('/detail.html','?id=157336',files),'movie-157336.html');
assert.equal(resolveSeoPage('/detail.html','?id=157336&type=tv',files),'tv-157336.html');
assert.equal(resolveSeoPage('/detail.html','?id=157336&type=movie',files),'movie-157336.html');
assert.equal(resolveSeoPage('/person.html','?id=1813',files),'person-1813.html');
for (const [path,query] of [
 ['/detail.html','?id=0'],['/detail.html','?id=157336&id=1813'],
 ['/detail.html','?id=157336&type=unknown'],['/detail.html','?id=157336&type=tv&type=movie'],
 ['/detail.html','?id=999999'],['/person.html','?id=157336'],
 ['/person.html','?id=1813&type=tv'],['/other.html','?id=157336'],
 ['/detail.html','?id=0157336'],['/detail.html','?id=abc']
]) assert.equal(resolveSeoPage(path,query,files),null,path+query);
console.log('SEO routing resolver tests passed');
