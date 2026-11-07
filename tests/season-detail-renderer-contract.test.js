'use strict';
// Offline compatibility contract between new season response and detail.html.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {seasonResponse}=require('../api/_season-ledger-response');
const html=fs.readFileSync(path.join(__dirname,'../detail.html'),'utf8');
const start=html.indexOf('function renderEpisodes(');
assert.ok(start>=0,'renderEpisodes missing');
const end=html.indexOf('/* =========================================================',start+40);
assert.ok(end>start,'renderEpisodes boundary missing');
const renderer=html.slice(start,end);
const response=seasonResponse({type:'tv',id:88,seasonNumber:2,seasonName:'第2シーズン',
 episodes:[{episodeNumber:1,title:'第1話',airDate:'2026-11-01',runtimeMinutes:42,overview:'あらすじ'}]});
assert.equal(response.season_number,2);
assert.equal(response.season_name,'第2シーズン');
assert.equal(response.episodes[0].episode_number,1);
assert.equal(response.episodes[0].name,'第1話');
assert.equal(response.episodes[0].air_date,'2026-11-01');
assert.equal(response.episodes[0].runtime,42);
assert.equal(response.episodes[0].overview,'あらすじ');
const accessed=[...renderer.matchAll(/(?:data|episode)\.([a-z_]+)/g)].map(m=>m[1]);
const required=[...new Set(accessed.filter(x=>!['length','forEach'].includes(x)))];
for(const field of required){
 if(field==='episodes'||field==='season_name'||field==='season_number'){
  assert.ok(Object.hasOwn(response,field),'missing season field '+field);
 }else{
  assert.ok(Object.hasOwn(response.episodes[0],field),'missing episode field '+field);
 }
}
assert.ok(!('streaming' in response)&&!('rental' in response)&&!('purchase' in response),
 'streaming fields must not be silently duplicated into season ledger');
console.log('season response/detail renderer compatibility contract tests passed');
