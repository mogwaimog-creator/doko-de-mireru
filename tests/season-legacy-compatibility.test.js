'use strict';
// Offline compatibility contract for the fields consumed by detail.html renderEpisodes.
// The legacy object is a representative fixture of api/search.js getTvSeason's output,
// not a live API response. This test does not exercise the deployed endpoint.
const assert=require('node:assert/strict');
const {fromTmdbSeason}=require('../api/_season-ledger-cache');
const {seasonResponse}=require('../api/_season-ledger-response');
const tmdb={season_number:1,name:'第1期',air_date:'2024-01-01',
 episodes:[{episode_number:1,name:'はじまり',air_date:'2024-01-01',
 runtime:24,overview:'第1話',still_path:'/image.jpg'},
 {episode_number:2,name:'つづき',air_date:null,runtime:null,overview:''}]};
const legacy={id:123,title:'テスト作品',season_number:1,season_name:'第1期',
 poster_path:null,air_date:'2024-01-01',episode_count:2,
 episodes:tmdb.episodes.map(e=>({episode_number:e.episode_number,name:e.name,
 air_date:e.air_date||'',runtime:Number(e.runtime||0),overview:e.overview||'',
 still_path:e.still_path||null})),
 streaming:[],rental:[],purchase:[]};
const modern=seasonResponse(fromTmdbSeason(123,1,tmdb));
function visibleShape(data){
 return {season_number:data.season_number,season_name:data.season_name,
 episodes:data.episodes.map(e=>({episode_number:e.episode_number,name:e.name,
 air_date:e.air_date||'',runtime:Number(e.runtime||0),overview:e.overview||''}))};
}
assert.deepEqual(visibleShape(modern),visibleShape(legacy));
assert.equal(modern.episodes[0].still_path,undefined);
assert.equal(modern.streaming,undefined);
assert.equal(modern.rental,undefined);
assert.equal(modern.purchase,undefined);
console.log('season legacy/new visible fields comparison tests passed');
