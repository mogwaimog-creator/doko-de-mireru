'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {audit}=require('../scripts/audit-seo-ledger-export');
const good=(type,id)=>({schemaVersion:1,type,id,title:'A',extensions:{tmdbDetail:{id,title:'A',poster_path:'/a.jpg'}}});
test('counts readiness and missing data without exposing work titles or IDs',()=>{
 const result=audit([
  good('movie',1),good('tv',1),
  {schemaVersion:1,type:'movie',id:2,title:'B'},
  {schemaVersion:1,type:'movie',id:3,title:'C',extensions:{tmdbDetail:{id:4,title:'C'}}},
  {...good('movie',4),extensions:{tmdbDetail:{id:4,title:'D',streaming:[]}}},
  good('movie',1),
  {type:'movie',id:99,title:'invalid'}
 ]);
 assert.deepEqual(result,{total:7,ready:2,missingFixedDetail:1,identityMismatch:1,providerLeak:1,invalidRecord:2,complete:false});
 assert.doesNotMatch(JSON.stringify(result),/poster|title|movie|tv/);
});
test('all valid records pass',()=>assert.equal(audit([good('movie',4)]).complete,true));
