'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {importBatch,BATCH}=require('../api/admin-import-series-works')._test;
test('existing works are skipped and not overwritten',async()=>{
 const calls=[];
 const read=async args=>{calls.push(args);return args[0]==='GET'?JSON.stringify({schemaVersion:1,type:args[1].split(':')[3],id:Number(args[1].split(':')[4]),title:'登録済み作品'}):null;};
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

test('invalid existing ledger records are reported, not overwritten',async()=>{
 const errors=[];
 const read=async args=>args[0]==='GET'?'invalid-json':null;
 const result=await importBatch(0,{read,load:async()=>{throw Error('must not fetch')},logError:async event=>errors.push(event)});
 assert.equal(result.imported,0);
 assert.equal(result.alreadyPresent,0);
 assert.equal(result.failed.length,BATCH);
 assert.equal(errors.length,BATCH);
});
