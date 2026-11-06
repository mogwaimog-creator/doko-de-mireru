'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {extractFixedDetail}=require('../scripts/extract-seo-fixed-detail');
const base={schemaVersion:1,type:'movie',id:77,title:'映画A'};
test('extracts TMDB-compatible fixed detail without streaming provider data',()=>{
 const row={...base,extensions:{tmdbDetail:{id:77,title:'映画A',poster_path:'/poster.jpg',release_date:'2024-01-01',credits:{cast:[]},'watch/providers':{results:{JP:{flatrate:[{provider_id:8}]}}}}}};
 const result=extractFixedDetail(row);
 assert.equal(result.metadata.poster_path,'/poster.jpg');
 assert.equal(result.metadata.release_date,'2024-01-01');
 assert.equal(result.metadata['watch/providers'],undefined);
 assert.equal(result.metadata.credits.cast.length,0);
 assert.equal(row.extensions.tmdbDetail['watch/providers'].results.JP.flatrate.length,1);
});
test('refuses incomplete, mismatched, or streaming-bearing metadata',()=>{
 assert.throws(()=>extractFixedDetail(base),/Missing or mismatched/);
 assert.throws(()=>extractFixedDetail({...base,extensions:{tmdbDetail:{id:88,title:'Other'}}}),/Missing or mismatched/);
 assert.throws(()=>extractFixedDetail({...base,extensions:{tmdbDetail:{id:77,title:'映画A',streaming:[]}}}),/Dynamic provider fields/);
});
test('movie and TV identity stay distinct',()=>{
 const tv={...base,type:'tv',extensions:{tmdbDetail:{id:77,name:'ドラマA'}}};
 assert.equal(extractFixedDetail(tv).type,'tv');
});
