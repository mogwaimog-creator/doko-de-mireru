'use strict';
const assert=require('node:assert/strict');
const {getCachedSeason}=require('../api/_season-ledger-cache');
const base={type:'tv',id:55,seasonNumber:1,getRecord:async()=>null,
 putRecordIfAbsent:async()=>{const e=Error('frozen');e.code='SEASON_LEDGER_WRITES_FROZEN';throw e;}};
(async()=>{
 let calls=0,release;
 const wait=new Promise(resolve=>{release=resolve;});
 const fetchSeason=async()=>{calls++;await wait;return {season_number:1,name:'One',episodes:[]};};
 const pending=Array.from({length:10},()=>getCachedSeason({...base,fetchSeason}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls,1,'simultaneous calls on one instance should share fetch');
 release();
 const responses=await Promise.all(pending);
 assert.equal(responses.length,10);
 assert.equal(responses[0].season_number,1);
 await getCachedSeason({...base,fetchSeason});
 assert.equal(calls,2,'later requests are not cached in memory');
 let failed=0;
 const broken=async()=>{failed++;throw Error('upstream');};
 await assert.rejects(getCachedSeason({...base,id:56,fetchSeason:broken}),/upstream/);
 await assert.rejects(getCachedSeason({...base,id:56,fetchSeason:broken}),/upstream/);
 assert.equal(failed,2,'failure must not poison future requests');
 console.log('season concurrent fetch coalescing tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
