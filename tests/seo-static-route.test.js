'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseStaticSeoPath}=require('../scripts/seo-static-route');
test('static paths identify the same work as legacy query URLs',()=>{
 assert.deepEqual(parseStaticSeoPath('/seo-pages/movie-50014.html'),{kind:'work',type:'movie',id:50014,legacyUrl:'/detail.html?id=50014'});
 assert.deepEqual(parseStaticSeoPath('/seo-pages/tv-202879.html'),{kind:'work',type:'tv',id:202879,legacyUrl:'/detail.html?id=202879&type=tv'});
 assert.deepEqual(parseStaticSeoPath('/seo-pages/person-42.html'),{kind:'person',id:42,legacyUrl:'/person.html?id=42'});
});
test('static path parser rejects invalid paths and IDs',()=>{
 for(const path of ['/seo-pages/movie-0.html','/seo-pages/movie-../1.html','/seo-pages/movie-abc.html','/detail.html?id=1','/seo-pages/movie-1.html/extra','/seo-pages/movie-12345678901.html'])assert.equal(parseStaticSeoPath(path),null);
});
