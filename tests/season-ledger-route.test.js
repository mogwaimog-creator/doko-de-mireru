'use strict';
const assert=require('node:assert/strict');
const {parseSeasonRequest,handleSeasonLedgerRequest}=require('../api/_season-ledger-route');
(async()=>{
 assert.deepEqual(parseSeasonRequest({type:'anime',id:'123',season:'1'}),{type:'tv',id:123,seasonNumber:1});
 for(const query of [{type:'movie',id:'1',season:'1'},{type:'tv',id:'-1',season:'1'},
 {type:'tv',id:'1x',season:'1'},{type:'tv',id:'1',season:'1x'},
 {type:'tv',id:'1',season:'-1'},{type:'tv',id:'99999999999999999999',season:'1'}])
 assert.equal(parseSeasonRequest(query),null);
 let reads=0,fetches=0;
 const deps={getRecord:async()=>{reads++;return {type:'tv',id:123,seasonNumber:1,seasonName:'第1期',episodes:[]}},
 putRecordIfAbsent:async()=>{throw Error('unexpected write')},
 fetchSeason:async()=>{fetches++;throw Error('unexpected TMDB fetch')}};
 const data=await handleSeasonLedgerRequest({type:'tv',id:'123',season:'1'},deps);
 assert.equal(data.season_name,'第1期');
 assert.equal(reads,1);assert.equal(fetches,0);
 console.log('season ledger route tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
