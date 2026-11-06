'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {toDetailFixed}=require('../scripts/work-ledger-to-detail-fixed');
test('movie ledger metadata uses existing detail naming and retains cast',()=>{
 const fixed=toDetailFixed({schemaVersion:1,type:'movie',id:50014,title:'映画',posterPath:'/m.jpg',runtimeMinutes:121,directors:[{name:'監督'}],cast:[{id:1,name:'出演者',profilePath:'/p.jpg'}]});
 assert.equal(fixed.poster_path,'/m.jpg');
 assert.equal(fixed.runtime,121);
 assert.equal(fixed.director,'監督');
 assert.equal(fixed.cast[0].profile_path,'/p.jpg');
 assert.equal(Object.hasOwn(fixed,'streaming'),false);
});
test('TV ledger seasons convert from camelCase to detail keys',()=>{
 const fixed=toDetailFixed({schemaVersion:1,type:'tv',id:202879,title:'TV',seasons:[{seasonNumber:0,name:'特別編'},{seasonNumber:1,name:'第1期',episodeCount:8,airDate:'2025-01-01',posterPath:'/s.jpg'}]});
 assert.deepEqual(fixed.seasons,[{season_number:1,name:'第1期',episode_count:8,air_date:'2025-01-01',poster_path:'/s.jpg'}]);
 assert.equal(Object.hasOwn(fixed,'purchase'),false);
});
test('incomplete or invalid ledger metadata is rejected',()=>{
 assert.throws(()=>toDetailFixed({schemaVersion:1,type:'movie',id:1}),/Invalid/);
 assert.throws(()=>toDetailFixed({schemaVersion:1,type:'tv',id:0,title:'TV'}),/Invalid/);
});
