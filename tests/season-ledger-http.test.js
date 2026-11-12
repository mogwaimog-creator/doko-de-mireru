'use strict';
const assert=require('node:assert/strict');
const {createSeasonApiHandler}=require('../api/_season-ledger-http');
function response(){
 const out={statusCode:null,body:null};
 return {out,status(n){out.statusCode=n;return this;},json(body){out.body=body;return this;}};
}
const record={type:'tv',id:123,seasonNumber:1,seasonName:'第1期',episodes:[{episodeNumber:1,title:'はじまり',airDate:'2024-01-01',runtimeMinutes:24,overview:'第1話'}]};
(async()=>{
 let reads=0,fetches=0,writes=0;
 const handler=createSeasonApiHandler({
  getRecord:async()=>{reads++;return record;},
  putRecordIfAbsent:async()=>{writes++;throw Error('unexpected write');},
  fetchSeason:async()=>{fetches++;throw Error('unexpected fetch');}
 });
 let res=response();
 await handler({method:'GET',query:{type:'tv',id:'123',season:'1'}},res);
 assert.equal(res.out.statusCode,200);
 assert.equal(res.out.body.season_name,'第1期');
 assert.equal(res.out.body.episodes[0].name,'はじまり');
 assert.equal(reads,1);assert.equal(fetches,0);assert.equal(writes,0);
 res=response();
 await handler({method:'POST',query:{type:'tv',id:'123',season:'1'}},res);
 assert.equal(res.out.statusCode,405);
 res=response();
 await handler({method:'GET',query:{type:'movie',id:'123',season:'1'}},res);
 assert.equal(res.out.statusCode,400);
 const failing=createSeasonApiHandler({
  getRecord:async()=>{throw Error('Redis down: secret details');},
  putRecordIfAbsent:async()=>true,
  fetchSeason:async()=>({name:'test',episodes:[]})
 });
 res=response();
 await failing({method:'GET',query:{type:'tv',id:'123',season:'1'}},res);
 assert.equal(res.out.statusCode,503);
 assert.equal(res.out.body.error,'Season information temporarily unavailable');
 assert.ok(!JSON.stringify(res.out.body).includes('secret details'));
 console.log('season ledger HTTP boundary tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
