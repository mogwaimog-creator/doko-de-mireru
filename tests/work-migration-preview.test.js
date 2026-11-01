'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inventory,previewPage}=require('../api/admin-work-migration-preview')._test;
test('inventory keeps existing movie/tv IDs and deduplicates only identical keys',()=>{
 const result=inventory([{type:'movie',id:1},{type:'movie',id:1},{type:'tv',id:1}]);
 assert.deepEqual(result.works,[{type:'movie',id:1},{type:'tv',id:1}]);
 assert.equal(result.duplicates.length,1);
});
test('preview reads existing ledger without writing or contacting TMDB',async()=>{
 let calls=[];
 const result=await previewPage(0,async args=>{
  calls.push(args);
  return args.slice(1).map((key,i)=>i===0?JSON.stringify({schemaVersion:1,type:'movie',id:Number(key.split(':').at(-1)),title:'Existing'}):null);
 });
 assert.equal(calls.length,1);
 assert.equal(calls[0][0],'MGET');
 assert.equal(result.items[0].ledgerStatus,'registered');
 assert.equal(result.items[1].ledgerStatus,'not_registered');
 assert.ok(result.total>=result.items.length);
});
