'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeExtensions,selectForPage}=require('../api/_work-page-fields');
const work={type:'movie',id:1678,title:'Example',releaseDate:'2020-01-01',posterPath:'/poster.jpg'};
test('page extensions cannot override shared metadata',()=>{
 assert.throws(()=>normalizeExtensions({viewingOrder:{title:'Wrong'}}),/Unknown extension/);
 const result=selectForPage(work,'viewingOrder',{viewingOrder:{shortIntro:'Intro'}},{flatrate:[{provider_id:8}],rent:[{provider_id:2}]});
 assert.equal(result.title,'Example');
 assert.equal(result.extra.shortIntro,'Intro');
 assert.deepEqual(result.flatrate,[{provider_id:8}]);
 assert.equal('watch' in result,false);
});
test('movie shelf does not load provider data',()=>{
 const result=selectForPage(work,'movieShelf',{movieShelf:{historicalContext:'Context'}},{flatrate:[1]});
 assert.equal(result.extra.historicalContext,'Context');
 assert.equal('watch' in result,false);
 assert.equal('flatrate' in result,false);
});
