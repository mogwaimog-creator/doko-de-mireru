'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {workToLegacyDetail} = require('../api/_work-to-legacy-detail');

test('movie compact record reconstructs core detail fields', () => {
 const d=workToLegacyDetail({type:'movie',id:12,title:'映画',releaseDate:'2020-01-01',
  runtimeMinutes:110,cast:[{id:3,name:'出演者',profilePath:'/p'}],
  directors:[{id:4,name:'監督'}],collectionId:9,collectionName:'シリーズ'});
 assert.equal(d.title,'映画');
 assert.equal(d.release_date,'2020-01-01');
 assert.equal(d.credits.cast[0].profile_path,'/p');
 assert.equal(d.credits.crew[0].job,'Director');
 assert.equal(d.belongs_to_collection.id,9);
 assert.equal(d['watch/providers'],undefined);
});
test('TV compact record reconstructs seasons', () => {
 const d=workToLegacyDetail({type:'tv',id:42,title:'ドラマ',seasons:[{
  id:1,seasonNumber:2,name:'第2期',episodeCount:12,airDate:'2022-01-01',posterPath:'/s'
 }]});
 assert.equal(d.name,'ドラマ');
 assert.equal(d.seasons[0].season_number,2);
 assert.equal(d.seasons[0].episode_count,12);
 assert.equal(d['watch/providers'],undefined);
});
test('reject invalid work instead of silently importing it', () => {
 assert.throws(()=>workToLegacyDetail({type:'movie',id:0,title:'X'}));
});
