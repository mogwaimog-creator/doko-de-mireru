'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {store:workStore}=require('../prototype/work-ledger');
const {store:personStore}=require('../prototype/person-ledger');
const season=require('../prototype/season-ledger');
test('person credits resolve movie and TV works with identical numeric ID without provider duplication',()=>{
 const works=workStore(),people=personStore();
 works.register('movie',42,{title:'映画42'});
 works.register('tv',42,{title:'ドラマ42'});
 people.success({id:1813,name:'検証人物',cast:[{id:42,media_type:'movie',title:'映画42'},{id:42,media_type:'tv',name:'ドラマ42'}]},'2026-11-08T00:00:00Z');
 const cards=people.get(1813).person.cast;
 assert.equal(cards.length,2);
 for(const card of cards){
  assert.equal(works.display(card.media_type,card.id).title,card.title);
  assert.deepEqual(Object.keys(card).sort(),['id','media_type','poster_path','title','year']);
 }
 const checked=people.get(1813).checkedAt;
 people.failure(1813);
 assert.equal(people.get(1813).checkedAt,checked);
});
test('TV season ledger provides correct detail episodes and rejects duplicates',()=>{
 const works=workStore();works.register('movie',42,{title:'映画42'});works.register('tv',42,{title:'ドラマ42'});
 const record=season.makeRecord(42,[{season_number:1,name:'第1期',episode_count:2,episodes:[{episode_number:1,name:'第1話',runtime:25},{episode_number:2,name:'第2話',runtime:25}]}],'2026-11-08T00:00:00Z');
 assert.equal(works.display('tv',record.tvId).title,'ドラマ42');
 assert.equal(season.toDetailEpisodes(record,1).episodes.length,2);
 assert.throws(()=>season.makeRecord(42,[{season_number:1,episodes:[{episode_number:1},{episode_number:1}]}],'2026-11-08T00:00:00Z'));
});
