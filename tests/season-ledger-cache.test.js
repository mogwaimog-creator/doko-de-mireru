'use strict';
const assert=require('node:assert/strict');
const {getCachedSeason}=require('../api/_season-ledger-cache');
(async()=>{
 let stored=null,fetches=0,writes=0;
 const deps={type:'tv',id:101,seasonNumber:1,
 getRecord:async()=>stored,
 putRecordIfAbsent:async rec=>{writes++;if(stored)return false;stored=rec;return true;},
 fetchSeason:async()=>{fetches++;return {season_number:1,name:'第1期',episodes:[{episode_number:1,name:'第一話',air_date:'2025-01-01',runtime:24,overview:'説明',still_path:'/unused.jpg'}]};}};
 const first=await getCachedSeason(deps);
 const second=await getCachedSeason(deps);
 assert.deepEqual(first,second);
 assert.equal(fetches,1);
 assert.equal(writes,1);
 assert.equal(first.episodes[0].name,'第一話');
 assert.equal(first.episodes[0].still_path,undefined);
 await assert.rejects(getCachedSeason({...deps,id:0}),/Invalid season identity/);
 await assert.rejects(getCachedSeason({...deps,type:'movie'}),/Invalid season identity/);
 const failure={...deps,id:102,getRecord:async()=>null,fetchSeason:async()=>{throw Error('TMDB failed')}};
 await assert.rejects(getCachedSeason(failure),/TMDB failed/);
 const mismatched={...deps,id:103,getRecord:async()=>null,putRecordIfAbsent:async()=>{throw Error('must not store mismatch')},fetchSeason:async()=>({season_number:2,name:'Wrong season',episodes:[]})};
 await assert.rejects(getCachedSeason(mismatched),/mismatched TMDB season/);
 console.log('season ledger cache-first tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
