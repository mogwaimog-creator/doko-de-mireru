'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{personSource,seasonSource,episodeSource}=require('../api/_content-source-adapters');
test('TMDB-shaped person copies retain profile and all five typed credit groups without provider work',()=>{
 const base={id:1813,name:'fixture',biography:'profile'},card=(id,more={})=>({id,media_type:'movie',title:'title',...more});const result=personSource(1813,base,{id:1813,cast:[card(1),card(2,{character:'voice'}),card(3,{genre_ids:[99]})],crew:[card(4,{job:'Director'}),card(5,{job:'Producer'})]});for(const key of ['cast','voice','directed','documentary_talk','other'])assert.equal(result[key].length,1);assert.equal(result.biography,'profile');assert.throws(()=>personSource(1813,base,{id:1,cast:[],crew:[]}),/identity/);assert.throws(()=>personSource(1813,base,{id:1813,cast:[]}),/incomplete/);
});
test('TV and season IDs stay distinct and missing episode bodies remain unknown',()=>{
 const result=seasonSource(85937,{id:85937,seasons:[{id:999,season_number:1,name:'fixture',episode_count:2}]});assert.equal(result.tvId,85937);assert.equal(result.seasons[0].episodes,null);
 const episode=episodeSource(85937,1,{tvId:85937,seasonNumber:1,data:{id:999,season_number:1,episodes:[{episode_number:1,name:'one'}]}});assert.equal(episode.tvId,85937);assert.equal(episode.episodes[0].episodeNumber,1);assert.throws(()=>episodeSource(85937,1,{tvId:1,seasonNumber:1,data:{season_number:1,episodes:[]}}),/identity/);
});
