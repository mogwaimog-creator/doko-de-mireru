'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {select}=require('../scripts/select-seo-verified-works');
const work=(id=77)=>({schemaVersion:1,type:'movie',id,title:'映画',releaseDate:'2020-01-01',posterPath:'/poster',overview:'あらすじ',verification:{identity:'verified',metadata:'verified'},errors:[],extensions:{tmdbDetail:{id,title:'映画'}}});
test('explicitly verified complete work is selected without mutation',()=>{
 const row=work(),before=JSON.stringify(row),r=select([row]);
 assert.equal(r.approved.length,1);assert.equal(r.skipped.length,0);
 assert.equal(JSON.stringify(row),before);
});
test('unverified, erroneous and wrong-detail works are not published',()=>{
 const a=work(1),b=work(2),c=work(3);
 a.verification.metadata='not_checked';b.errors=[{code:'FAIL'}];c.extensions.tmdbDetail.id=100;
 const r=select([a,b,c]);
 assert.equal(r.approved.length,0);
 assert.deepEqual(r.skipped.map(x=>x.reasons[0]),['NOT_VERIFIED','RECORDED_ERRORS','MISSING_OR_MISMATCHED_DETAIL']);
});
test('duplicate identity blocks both copies',()=>{
 const r=select([work(1),work(1)]);
 assert.equal(r.approved.length,0);
 assert.equal(r.skipped.length,2);
});
test('export scan problem fails closed and never publishes a partial set',()=>{
 const r=select({records:[work()],problems:[{key:'doko:work:v1:movie:999',code:'INVALID_JSON'}]});
 assert.equal(r.approved.length,0);
 assert.equal(r.blocked,'EXPORT_PROBLEMS');
});

test('verified flag does not override title/date/poster mismatches or provider contamination',()=>{
 const a=work(10),b=work(11),c=work(12),d=work(13);
 a.extensions.tmdbDetail.title='別作品';
 b.extensions.tmdbDetail.release_date='1999-01-01';
 c.extensions.tmdbDetail.poster_path='/wrong.jpg';
 d.extensions.tmdbDetail['watch/providers']={results:{JP:{}}};
 const r=select([a,b,c,d]);
 assert.equal(r.approved.length,0);
 assert.ok(r.skipped[0].reasons.includes('TITLE_MISMATCH'));
 assert.ok(r.skipped[1].reasons.includes('DATE_MISMATCH'));
 assert.ok(r.skipped[2].reasons.includes('POSTER_MISMATCH'));
 assert.ok(r.skipped[3].reasons.includes('PROVIDER_DATA_IN_FIXED'));
});
