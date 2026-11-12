'use strict';
const assert=require('node:assert/strict');
const {getCachedSeason}=require('../api/_season-ledger-cache');
const {createSeasonRedisAdapter}=require('../api/_season-ledger-redis');
const {key}=require('../api/_season-ledger-redis');
const frozen=()=>{const e=new Error('frozen');e.code='SEASON_LEDGER_WRITES_FROZEN';throw e;};
let fetches=0,gets=0;
const opts={type:'tv',id:789012,seasonNumber:3,
 getRecord:async()=>{gets++;return null;},
 putRecordIfAbsent:frozen,
 fetchSeason:async()=>{fetches++;return {season_number:3,name:'season',episodes:[]};}
};
(async()=>{
 const first=await getCachedSeason(opts);
 const second=await getCachedSeason(opts);
 assert.equal(first.season_number,3);
 assert.equal(second.season_number,3);
 assert.equal(fetches,2,'sequential misses refetch when writes frozen');
 assert.equal(gets,2,'each request reads Redis');
 assert.match(key('tv',789012,3),/^doko:season:v1:tv:/);
 let calls=0,release;
 const gate=new Promise(resolve=>{release=resolve;});
 const parallel={...opts,id:789013,fetchSeason:async()=>{calls++;await gate;return {season_number:3,name:'season',episodes:[]};}};
 const pending=[getCachedSeason(parallel),getCachedSeason(parallel),getCachedSeason(parallel)];
 await Promise.resolve();await Promise.resolve();release();
 await Promise.all(pending);
 assert.equal(calls,1,'simultaneous misses coalesce within one process');
 console.log('season frozen miss sequential refetch and concurrent coalescing tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
