'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {selectSaved}=require('../scripts/audit-staged-five-ledgers');
test('incremental audits cover every saved identity once without repeating earlier batches',()=>{
 const saved=Array.from({length:35},(_,i)=>(i%2?'tv:':'movie:')+(i+1));
 const keys=[];for(let offset=0;offset<saved.length;offset+=16)keys.push(...selectSaved(saved,['--offset',String(offset),'--limit','16']).keys);
 assert.deepEqual(keys,saved);assert.equal(new Set(keys).size,saved.length);
 assert.deepEqual(selectSaved(saved,[]).keys,saved);
});
test('invalid or excessive explicit audit ranges stop before storage work',()=>{
 for(const args of [['--offset','-1'],['--offset','2.5'],['--offset','3'],['--limit','0'],['--limit','17'],['--limit'],['--limit','NaN']])assert.throws(()=>selectSaved(['movie:1','tv:1'],args),/audit range/);
 assert.deepEqual(selectSaved(['movie:1','tv:1'],['--offset','1','--limit','1']).keys,['tv:1']);
});
