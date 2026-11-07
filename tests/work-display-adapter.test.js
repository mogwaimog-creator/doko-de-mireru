'use strict';
const assert=require('node:assert/strict');
const {workToDetail}=require('../api/_work-display-adapter');
const base={
 type:'movie',id:42,title:'Example',originalTitle:'Original',
 releaseDate:'2020-01-02',overview:'Summary',posterPath:'/p.jpg',
 genres:[{id:1,name:'Drama'}],directors:[{id:5,name:'Director'}],
 cast:[{id:6,name:'Actor',character:'Lead',profilePath:'/a.jpg'}],
 runtimeMinutes:120,voteAverage:7.2,voteCount:30,
 collectionId:9,collectionName:'Collection'
};
const movie=workToDetail(base);
assert.equal(movie.title,'Example');
assert.equal(movie.credits.crew[0].job,'Director');
assert.equal(movie.credits.cast[0].profile_path,'/a.jpg');
assert.equal(movie.belongs_to_collection.id,9);
assert.equal(movie.runtime,120);
assert.equal(movie['watch/providers'],undefined);
assert.equal(movie.extensions,undefined);
const tv=workToDetail({
 ...base,type:'tv',id:43,collectionId:null,status:'Ended',
 seasons:[{id:8,seasonNumber:1,name:'Season 1',episodeCount:10,
 airDate:'2020-01-02',posterPath:'/s.jpg'}]
});
assert.equal(tv.name,'Example');
assert.equal(tv.seasons[0].season_number,1);
assert.deepEqual(tv.episode_run_time,[120]);
assert.equal(tv.status,'Ended');
assert.equal(tv.belongs_to_collection,undefined);
assert.throws(()=>workToDetail({...base,id:0}),/Invalid/);
assert.throws(()=>workToDetail({...base,title:''}),/Invalid/);
console.log('work display adapter: 14 assertions passed');
