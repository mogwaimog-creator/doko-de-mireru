'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {identity,normalizeWork}=require('../api/_work-ledger');
const {fromTmdb}=require('../api/_work-from-tmdb');
const {fixedOnly}=require('../api/_detail-metadata-cache');

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

test('full fixed detail keeps editorial fields but never includes streaming',()=>{
  const original={id:12,title:'映画',created_by:[{name:'制作者'}],seasons:[{season_number:1}],credits:{cast:[]},
    'watch/providers':{results:{JP:{flatrate:[{provider_id:8}]}}}};
  const fixed=fixedOnly(original);
  assert.equal(fixed['watch/providers'],undefined);
  assert.equal(fixed.created_by[0].name,'制作者');
  assert.equal(fixed.seasons[0].season_number,1);
  assert.equal(fixed.credits.cast.length,0);
  assert.ok(original['watch/providers']);
});

const {refreshDue,nextReviewAt,DAY}=require('../api/_detail-providers-cache');
test('detail streaming refresh is independent of series refresh windows',()=>{
 const now=Date.parse('2026-11-03T03:00:00Z');
 assert.equal(refreshDue({checkedAt:new Date(now-DAY+1000).toISOString()},now),false);
 assert.equal(refreshDue({checkedAt:new Date(now-DAY-1000).toISOString()},now),true);
 assert.equal(nextReviewAt(Date.parse('2026-11-03T02:00:00Z')),Date.parse('2026-11-03T03:00:00Z'));
 assert.equal(nextReviewAt(Date.parse('2026-11-03T04:00:00Z')),Date.parse('2026-11-04T03:00:00Z'));
});

test('unknown future fields and page-specific notes do not collide',()=>{
 const record=normalizeWork('tv',77,{
   title:'作品B',
   commonNotes:{production:'共通の補足'},
   pageExtras:{watch_order:{order:1,summary:'順番専用'},movie_shelf:{award:'特集専用'}},
   extensions:{futureSection:{customKey:'保持する'}}
 });
 assert.equal(record.commonNotes.production,'共通の補足');
 assert.equal(record.pageExtras.watch_order.summary,'順番専用');
 assert.equal(record.pageExtras.movie_shelf.award,'特集専用');
 assert.equal(record.extensions.futureSection.customKey,'保持する');
 assert.equal(record.type,'tv');
});

test('feature flag off preserves existing detail loading without ledger access',async()=>{
 const {metadataWithLedger}=require('../api/_detail-metadata-cache');
 const previous=process.env.WORK_LEDGER_ENABLED;
 delete process.env.WORK_LEDGER_ENABLED;
 let calls=0;
 try{
   const expected={id:321,title:'従来の作品', 'watch/providers':{results:{JP:{}}}};
   const result=await metadataWithLedger('movie',321,async()=>{calls++;return expected;});
   assert.equal(calls,1);
   assert.strictEqual(result,expected);
 }finally{
   if(previous===undefined)delete process.env.WORK_LEDGER_ENABLED;
   else process.env.WORK_LEDGER_ENABLED=previous;
 }
});
