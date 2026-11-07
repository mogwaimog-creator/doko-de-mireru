'use strict';
const assert=require('node:assert/strict');
const {seasonResponse}=require('../api/_season-ledger-response');
const response=seasonResponse({type:'tv',id:101,seasonNumber:1,seasonName:'第1期',episodes:[
 {episodeNumber:1,title:'始まり',airDate:'2024-01-01',runtimeMinutes:24,overview:'説明'},
 {episodeNumber:2,title:'続き'}
]});
assert.equal(response.season_number,1);
assert.equal(response.season_name,'第1期');
assert.deepEqual(response.episodes[0],{episode_number:1,name:'始まり',air_date:'2024-01-01',runtime:24,overview:'説明'});
assert.equal(response.episodes[1].episode_number,2);
assert.equal(response.episodes[1].runtime,null);
assert.throws(()=>seasonResponse({type:'movie',id:101,seasonNumber:1,episodes:[]}),/Invalid/);
assert.throws(()=>seasonResponse({type:'tv',id:101,seasonNumber:1,episodes:[{episodeNumber:0}]}),/Invalid/);
console.log('season ledger response adapter tests passed');
