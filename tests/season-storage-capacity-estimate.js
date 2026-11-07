'use strict';
// Offline scenario estimator only: synthetic records, no Redis, TMDB or network.
const {Buffer}=require('node:buffer');
const {key}=require('../api/_season-ledger-redis');
function makeRecord(id,episodeCount,overviewChars){
 return {type:'tv',id,seasonNumber:1,seasonName:'シーズン1',
  episodes:Array.from({length:episodeCount},(_,i)=>({
   episodeNumber:i+1,title:'エピソード'+(i+1),
   airDate:'2026-11-07',runtimeMinutes:24,
   overview:'あ'.repeat(overviewChars)
  })),checkedAt:'2026-11-07T00:00:00.000Z',status:'unknown'};
}
function bytes(record){
 return Buffer.byteLength(key(record.type,record.id,record.seasonNumber),'utf8')+
  Buffer.byteLength(JSON.stringify(record),'utf8');
}
const scenarios=[
 {episodes:12,overviewChars:100},
 {episodes:24,overviewChars:300},
 {episodes:50,overviewChars:500}
];
const records=[100,1000,3000];
console.log('Synthetic UTF-8 payload sizes only (not actual Upstash billing or Redis memory).');
for(const s of scenarios){
 const one=bytes(makeRecord(123456,s.episodes,s.overviewChars));
 console.log('episodes='+s.episodes+' overviewJapaneseChars='+s.overviewChars+
  ' key+JSONbytes='+one+' estimatesMiB='+
  records.map(n=>n+':'+(one*n/1048576).toFixed(2)).join(','));
}
console.log('season synthetic storage estimate complete');
