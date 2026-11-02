'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {identity,normalizeWork}=require('../api/_work-ledger');
const {fromTmdb}=require('../api/_work-from-tmdb');

test('movie and tv use distinct keys for the same numeric ID',()=>{
  assert.notEqual(identity('movie',123).key,identity('tv',123).key);
  assert.throws(()=>identity('anime',123));
  assert.throws(()=>identity('movie','not-an-id'));
});

test('metadata, review fields, errors and extensible page fields remain separate',()=>{
  const item=normalizeWork('movie',123,{
    title:'映画A',posterPath:'/poster.jpg',
    verification:{identity:'verified',metadata:'reviewed',items:{poster:true}},
    errors:[{area:'poster',message:'check'}],
    commonNotes:{note:'shared'},
    pageExtras:{mcu:{order:3,intro:'page-specific'},movie_shelf:{award:'sample'}},
    extensions:{futureField:{enabled:true}}
  });
  assert.equal(item.title,'映画A');
  assert.equal(item.verification.items.poster,true);
  assert.equal(item.errors[0].area,'poster');
  assert.equal(item.commonNotes.note,'shared');
  assert.equal(item.pageExtras.mcu.order,3);
  assert.equal(item.pageExtras.movie_shelf.award,'sample');
  assert.equal(item.extensions.futureField.enabled,true);
  assert.equal(item.providers,undefined);
});

test('TMDB conversion excludes streaming and preserves fixed credits',()=>{
  const item=fromTmdb('movie',{
    id:123,title:'映画A',release_date:'2020-01-01',poster_path:'/a.jpg',
    credits:{crew:[{id:1,name:'監督',job:'Director'}],cast:[{id:2,name:'出演者',character:'役'}]},
    'watch/providers':{results:{JP:{flatrate:[{provider_id:8}]}}}
  });
  assert.equal(item.title,'映画A');
  assert.equal(item.directors[0].name,'監督');
  assert.equal(item.cast[0].name,'出演者');
  assert.equal(item['watch/providers'],undefined);
});
