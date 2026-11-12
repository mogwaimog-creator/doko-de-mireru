'use strict';
const assert=require('node:assert/strict');
const {getCachedSeason}=require('../api/_season-ledger-cache');
const base={type:'tv',id:42,seasonNumber:1};
const fetched={season_number:1,name:'Season 1',episodes:[{episode_number:1,name:'Episode 1'}]};
(async()=>{
 let calls=0;
 let response=await getCachedSeason({...base,
  getRecord:async()=>null,fetchSeason:async()=>{calls++;return fetched;},
  putRecordIfAbsent:async()=>{const e=new Error('frozen');e.code='SEASON_LEDGER_WRITES_FROZEN';throw e;}
 });
 assert.equal(calls,1);assert.equal(response.episodes[0].name,'Episode 1');
 assert.equal(response.season_number,1);
 const saved={...base,seasonName:'Saved',episodes:[{episodeNumber:1,title:'Cached'}]};
 calls=0;
 response=await getCachedSeason({...base,getRecord:async()=>saved,
  fetchSeason:async()=>{calls++;throw Error('should not fetch');},
  putRecordIfAbsent:async()=>{throw Error('should not write');}});
 assert.equal(calls,0);assert.equal(response.episodes[0].name,'Cached');
 await assert.rejects(getCachedSeason({...base,getRecord:async()=>null,
  fetchSeason:async()=>fetched,putRecordIfAbsent:async()=>{throw Error('Redis failed');}}),/Redis failed/);
 console.log('season frozen write display fallback tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
