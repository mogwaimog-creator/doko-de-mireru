'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {importBatch,BATCH}=require('../api/admin-import-series-works')._test;
test('existing works are skipped and not overwritten',async()=>{
 const calls=[];
 const read=async args=>{calls.push(args);return args[0]==='GET'?'already there':null;};
 const result=await importBatch(0,{read,load:async()=>{throw Error('should not fetch');}});
 assert.equal(result.alreadyPresent,BATCH);
 assert.equal(result.imported,0);
 assert.ok(calls.every(c=>c[0]==='GET'));
});
test('invalid TMDB identity cannot be imported',async()=>{
 const calls=[],errors=[];
 const read=async args=>{calls.push(args);return null;};
 const result=await importBatch(0,{read,load:async()=>({id:-1}),logError:async event=>{errors.push(event)}});
 assert.equal(result.imported,0);
 assert.equal(result.failed.length,BATCH);
 assert.equal(errors.length,BATCH);
 assert.ok(errors.every(e=>e.code==='SERIES_IMPORT_FAILED'));
 assert.ok(calls.every(c=>c[0]==='GET'));
});
