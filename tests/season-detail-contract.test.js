'use strict';
const assert=require('node:assert/strict');
const {toBasicTmdbDetail}=require('../api/_work-v2-detail-adapter');
const {seasonResponse}=require('../api/_season-ledger-response');
const work={schemaVersion:2,type:'tv',id:123,title:'テスト作品',releaseDate:'2024-01-01',
 cast:[],genres:[],seasons:[{seasonNumber:1,name:'第1期',episodeCount:2,airDate:'2024-01-01'}]};
const detail=toBasicTmdbDetail(work);
assert.ok(Array.isArray(detail.seasons));
assert.equal(detail.seasons[0].season_number,1);
assert.equal(detail.seasons[0].name,'第1期');
assert.equal(detail.seasons[0].episode_count,2);
const response=seasonResponse({type:'tv',id:123,seasonNumber:1,seasonName:'第1期',
 episodes:[{episodeNumber:1,title:'はじまり',airDate:'2024-01-01',runtimeMinutes:24,overview:'第1話'}]});
assert.equal(response.season_number,detail.seasons[0].season_number);
assert.equal(response.season_name,detail.seasons[0].name);
assert.equal(response.episodes[0].episode_number,1);
assert.equal(response.episodes[0].name,'はじまり');
assert.equal(response.episodes[0].air_date,'2024-01-01');
assert.equal(response.episodes[0].runtime,24);
assert.equal(Object.hasOwn(response.episodes[0],'overview'),false);
console.log('season detail compatibility contract tests passed');
