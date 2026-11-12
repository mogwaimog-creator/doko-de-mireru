'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ledger=require('../prototype/season-ledger');
const {createSeasonStore}=require('../prototype/season-ledger-store');
const at='2026-11-08T00:00:00.000Z';
const season={season_number:1,name:'第1期',episode_count:1,air_date:'2026-01-01',poster_path:'/a.jpg'};
const detail={episodes:[{episode_number:1,name:'第1話',air_date:'2026-01-01',runtime:42,overview:'do not save'}]};
test('offline first fetch saves only display fields, never synopsis',async()=>{
 let saved=null,calls=0;
 const store=createSeasonStore({read:async()=>saved,write:async(_,v)=>{saved=v},fetchShow:async()=>({status:'Returning Series',seasons:[season]}),fetchSeason:async()=>{calls++;return detail},now:()=>new Date(at)});
 const result=await store.get(100);
 assert.equal(result.source,'updated');assert.equal(calls,1);assert.equal(saved.refreshDays,7);
 assert.equal(JSON.stringify(saved).includes('overview'),false);
 assert.equal(ledger.toDetailEpisodes(saved,1).episodes[0].name,'第1話');
 assert.equal((await store.get(100)).source,'cache');assert.equal(calls,1);
});
test('ended show switches to 90 days, planned continuation stays at 7',()=>{
 assert.equal(ledger.refreshDays('Ended'),90);
 assert.equal(ledger.refreshDays('Ended',true),7);
 assert.equal(ledger.refreshDays('Returning Series'),7);
 assert.equal(ledger.refreshDays(undefined),7);
});
test('too many required season fetches never partially overwrites or wastes calls',async()=>{
 let calls=0,writes=0;
 const store=createSeasonStore({read:async()=>null,write:async()=>{writes++},fetchShow:async()=>({status:'Ended',seasons:[season,{...season,season_number:2}]}),fetchSeason:async()=>{calls++;return detail},maxFetches:1,now:()=>new Date(at)});
 const result=await store.get(100);
 assert.equal(result.source,'batch-limit');assert.equal(calls,0);assert.equal(writes,0);
});
test('failed refresh preserves previous snapshot',async()=>{
 const previous=ledger.makeRecord(100,[{...season,episodes:detail.episodes,episodesCheckedAt:'2026-01-01T00:00:00.000Z'}],'2026-01-01T00:00:00.000Z');
 const store=createSeasonStore({read:async()=>previous,write:async()=>{throw Error('unexpected write')},fetchShow:async()=>{throw Error('TMDB unavailable')},fetchSeason:async()=>detail,now:()=>new Date(at)});
 const result=await store.get(100);
 assert.equal(result.source,'stale');assert.deepEqual(result.record,previous);
});
test('missing episode details are distinct from a confirmed empty list',()=>{
 const record=ledger.makeRecord(100,[season],at);
 assert.equal(ledger.toDetailEpisodes(record,1),null);
});
