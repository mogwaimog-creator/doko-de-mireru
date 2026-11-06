'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {audit}=require('../scripts/audit-ledger-detail-compatibility');
test('movie audit detects unmapped fixed fields without confusing providers',()=>{
 const result=audit({schemaVersion:1,type:'movie',id:50014,title:'映画'});
 assert.deepEqual(result.missing,['media_type','original_language','series','recommendations']);
 assert.deepEqual(result.leaked,[]);
 assert.equal(result.ready,false);
});
test('TV audit identifies metadata missing from the current ledger adapter',()=>{
 const result=audit({schemaVersion:1,type:'tv',id:202879,title:'TV'});
 for(const key of ['media_type','original_language','content_type','creators','number_of_seasons','number_of_episodes','status','series','recommendations'])
  assert.ok(result.missing.includes(key),key);
 assert.deepEqual(result.leaked,[]);
 assert.equal(result.ready,false);
});
