'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classifyFailure,recordStage}=require('../api/_aiven-refresh-diagnostics');
test('failure stages are distinct and never expose error messages',()=>{
 for(const [stage,category] of [['auth','AUTH_FAILURE'],['aiven-connect','AIVEN_CONNECTION_FAILURE'],['tmdb-fetch','TMDB_FETCH_FAILURE'],['aiven-save','AIVEN_SAVE_FAILURE']]){
  const value=classifyFailure(stage,Object.assign(Error('rediss://secret'),{code:'ETIMEDOUT'}));
  assert.equal(value.category,category);assert.equal(value.code,'ETIMEDOUT');
  assert.equal(JSON.stringify(value).includes('secret'),false);
 }
});
test('unknown codes are redacted and unknown stages rejected',()=>{
 assert.equal(classifyFailure('aiven-save',{code:'TOKEN_PRIVATE'}).code,'UNKNOWN');
 assert.throws(()=>classifyFailure('not-invoked',Error('x')),/unknown diagnostic stage/);
});
test('stage events have bounded fields and no network or storage side effects',()=>{
 const lines=[];recordStage('entry',{clock:()=>Date.parse('2026-11-18T00:00:00Z'),emit:(...args)=>lines.push(args)});
 assert.equal(lines[0][0],'STREAMING_CRON_STAGE');
 assert.deepEqual(JSON.parse(lines[0][1]),{stage:'entry',event:'entered',at:'2026-11-18T00:00:00.000Z'});
});
