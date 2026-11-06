'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {audit}=require('../scripts/audit-work-ledger-export');
const good=(id=157336)=>({
 schemaVersion:1,type:'movie',id,title:'インターステラー',
 releaseDate:'2014-11-05',posterPath:'/poster.jpg',overview:'宇宙を舞台にした映画',
 extensions:{tmdbDetail:{id,title:'インターステラー',release_date:'2014-11-05',poster_path:'/poster.jpg'}},
 verification:{identity:'not_recorded',metadata:'not_checked',items:{}},errors:[]
});
test('valid but unreviewed record stays unverified',()=>{
 const r=audit([good()]);
 assert.equal(r.stats.verified,0);
 assert.equal(r.stats.unverified,1);
 assert.deepEqual(r.issues.map(x=>x.code),['NOT_VERIFIED']);
 assert.equal(r.readOnly,true);
 assert.equal(r.automaticVerification,false);
});
test('mismatched embedded ID and duplicate work identity are both reported',()=>{
 const a=good(),b=good();
 b.extensions.tmdbDetail.id=999999;
 const r=audit([a,b]);
 assert.ok(r.issues.some(x=>x.code==='DUPLICATE_IDENTITY'));
 assert.ok(r.issues.some(x=>x.code==='DETAIL_ID_MISMATCH'));
});
test('recorded errors remain visible even with verified flags',()=>{
 const r=good();
 r.verification.identity='verified';r.verification.metadata='verified';
 r.errors=[{code:'PREVIOUS_FAILURE'}];
 const result=audit([r]);
 assert.equal(result.stats.verified,1);
 assert.ok(result.issues.some(x=>x.code==='RECORDED_ERRORS'));
});
test('missing detail or poster is reported without mutating original',()=>{
 const r=good();
 delete r.extensions.tmdbDetail;
 r.posterPath=null;
 const before=JSON.stringify(r);
 const report=audit([r]);
 assert.ok(report.issues.some(x=>x.code==='MISSING_DETAIL'));
 assert.ok(report.issues.some(x=>x.code==='MISSING_POSTER'));
 assert.equal(JSON.stringify(r),before);
});

test('actual read-only export envelope can be audited without dropping scan problems',()=>{
 const report=audit({records:[good()],problems:[{key:'doko:work:v1:movie:123',code:'INVALID_JSON'}],readOnly:true});
 assert.equal(report.stats.total,1);
 assert.ok(report.issues.some(x=>x.code==='INVALID_JSON'));
 assert.ok(report.issues.some(x=>x.code==='NOT_VERIFIED'));
});
