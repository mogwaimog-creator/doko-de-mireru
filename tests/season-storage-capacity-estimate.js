'use strict';
// Offline synthetic comparison. No Redis/TMDB/network. UTF-8 payload, not actual Redis memory.
const {Buffer}=require('node:buffer');
const {key}=require('../api/_season-ledger-redis');
function makeRecord(id,episodeCount,overviewChars,includeOverview){
 return {type:'tv',id,seasonNumber:1,seasonName:'シーズン1',
  episodes:Array.from({length:episodeCount},(_,i)=>({
   episodeNumber:i+1,title:'エピソード'+(i+1),
   airDate:'2026-11-07',runtimeMinutes:24,
   ...(includeOverview?{overview:'あ'.repeat(overviewChars)}:{})
  })),checkedAt:'2026-11-07T00:00:00.000Z',status:'unknown'};
}
function bytes(record){
 return Buffer.byteLength(key(record.type,record.id,record.seasonNumber),'utf8')+
  Buffer.byteLength(JSON.stringify(record),'utf8');
}
const scenarios=[{episodes:12,overviewChars:100},{episodes:24,overviewChars:300},{episodes:50,overviewChars:500}];
const counts=[100,1000,3000];
console.log('Synthetic UTF-8 key+JSON only; excludes Redis overhead and other ledgers.');
for(const {episodes,overviewChars} of scenarios){
 const before=bytes(makeRecord(123456,episodes,overviewChars,true));
 const after=bytes(makeRecord(123456,episodes,overviewChars,false));
 const percent=((before-after)/before*100).toFixed(1);
 console.log('episodes='+episodes+' previousSynopsisChars='+overviewChars+
  ' beforeBytes='+before+' afterBytes='+after+' reduction='+percent+'%');
 for(const count of counts){
  console.log('  seasons='+count+' beforeMiB='+(before*count/1048576).toFixed(2)+
   ' afterMiB='+(after*count/1048576).toFixed(2));
 }
}
console.log('season synthetic storage comparison complete');
