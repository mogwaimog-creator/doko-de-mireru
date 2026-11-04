'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {fromTmdb}=require('../api/_work-from-tmdb');
const {normalizeWork}=require('../api/_work-ledger');
const {fixedOnly}=require('../api/_detail-metadata-cache');
const {extractFixedDetail}=require('../scripts/extract-seo-fixed-detail');
for(const type of ['movie','tv']){
 test('actual TMDB-to-ledger pipeline retains fixed '+type+' detail and excludes providers',()=>{
  const id=202879;
  const raw={
   id,title:'映画A',original_title:'Movie A',name:'ドラマA',original_name:'TV A',
   poster_path:'/poster.jpg',release_date:'2025-01-01',first_air_date:'2025-01-02',
   runtime:115,episode_run_time:[47],vote_average:7.5,
   genres:[{id:1,name:'ドラマ'}],credits:{crew:[{id:1,name:'監督',job:'Director'}],cast:[{id:2,name:'出演者'}]},
   'watch/providers':{results:{JP:{flatrate:[{provider_id:8}]}}}
  };
  const ledger=normalizeWork(type,id,{
   ...fromTmdb(type,raw),extensions:{tmdbDetail:fixedOnly(raw)}
  });
  const output=extractFixedDetail(ledger);
  assert.equal(output.id,id);
  assert.equal(output.type,type);
  assert.equal(output.metadata.poster_path,'/poster.jpg');
  assert.equal(output.metadata.credits.cast[0].name,'出演者');
  assert.equal(output.metadata['watch/providers'],undefined);
  assert.equal(output.metadata.streaming,undefined);
  assert.equal(ledger.runtimeMinutes,type==='tv'?47:115);
  assert.equal(ledger.posterPath,'/poster.jpg');
 });
}
