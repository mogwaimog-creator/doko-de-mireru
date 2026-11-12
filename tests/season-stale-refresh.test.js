'use strict';
const assert=require('node:assert/strict');
const {refreshCachedSeason}=require('../api/_season-ledger-refresh');
const DAY=86400000,now=Date.parse('2026-11-07T00:00:00Z');
const saved={type:'tv',id:12,seasonNumber:1,seasonName:'old',
 episodes:[{episodeNumber:1,title:'old episode'}],
 checkedAt:new Date(now-8*DAY).toISOString(),status:'airing'};
const payload={season_number:1,name:'new',episodes:[{episode_number:1,name:'new episode'}]};
(async()=>{
 let fetches=0,refreshes=0;
 const fetchSeason=async()=>{fetches++;return payload;};
 const refreshRecord=async(_saved,load)=>{refreshes++;return load();};
 let response=await refreshCachedSeason({saved:{...saved,checkedAt:new Date(now-DAY).toISOString()},
  id:12,seasonNumber:1,fetchSeason,refreshRecord,now});
 assert.equal(response.episodes[0].name,'old episode');assert.equal(fetches,0);
 response=await refreshCachedSeason({saved,id:12,seasonNumber:1,fetchSeason,refreshRecord,now});
 assert.equal(response.episodes[0].name,'new episode');assert.equal(fetches,1);assert.equal(refreshes,1);
 response=await refreshCachedSeason({saved,id:12,seasonNumber:1,fetchSeason,
  refreshRecord:async()=>null,now});
 assert.equal(response.episodes[0].name,'old episode');
 response=await refreshCachedSeason({saved,id:12,seasonNumber:1,
  fetchSeason:async()=>{throw Error('TMDB down');},refreshRecord,now});
 assert.equal(response.episodes[0].name,'old episode');
 response=await refreshCachedSeason({saved,id:12,seasonNumber:1,
  fetchSeason:async()=>({...payload,season_number:2}),refreshRecord,now});
 assert.equal(response.episodes[0].name,'old episode');
 response=await refreshCachedSeason({saved,id:12,seasonNumber:1,fetchSeason,
  refreshRecord:async()=>{throw Error('Redis down');},now});
 assert.equal(response.episodes[0].name,'old episode');
 assert.equal(refreshes,3);
 await assert.rejects(refreshCachedSeason({saved,id:999,seasonNumber:1,fetchSeason,refreshRecord,now}),/identity/);
 console.log('season stale refresh fallback tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
