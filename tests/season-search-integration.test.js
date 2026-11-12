'use strict';
const assert=require('node:assert/strict');
const {makeSeasonSearchBranch}=require('../api/_season-search-branch');
function response(){const out={};return {out,status(code){out.status=code;return this},json(body){out.body=body;return this}}}
(async()=>{
 const calls=[];const saved=new Map();let writes=0;
 const storage={
  getRecord:async(t,id,n)=>saved.get(t+':'+id+':'+n)||null,
  putRecordIfAbsent:async(record)=>{writes++;const k=record.type+':'+record.id+':'+record.seasonNumber;if(saved.has(k))return false;saved.set(k,record);return true;}
 };
 const handler=makeSeasonSearchBranch({apiKey:'TEST_ONLY',storage,
  fetchJson:async(url)=>{calls.push(url);return {season_number:2,name:'第2期',episodes:[{episode_number:1,name:'第1話',runtime:25}]};}
 });
 let res=response();await handler({method:'GET',query:{id:'123',type:'tv',season:'2'}},res);
 assert.equal(res.out.status,200);
 assert.equal(res.out.body.episodes[0].name,'第1話');
 assert.equal(calls.length,1);
 assert.match(calls[0],/\/tv\/123\/season\/2\?/);
 assert.ok(!calls[0].includes('append_to_response'));
 assert.ok(!calls[0].includes('watch/providers'));
 assert.equal(writes,1);
 res=response();await handler({method:'GET',query:{id:'123',type:'tv',season:'2'}},res);
 assert.equal(res.out.status,200);assert.equal(calls.length,1);assert.equal(writes,1);
 const broken=makeSeasonSearchBranch({apiKey:'TEST_ONLY',storage:{
 getRecord:async()=>null,putRecordIfAbsent:async()=>{throw Error('must not store bad data')}},
 fetchJson:async()=>({status_message:'TMDB error'})});
 res=response();await broken({method:'GET',query:{id:'124',type:'tv',season:'2'}},res);
 assert.equal(res.out.status,503);
 console.log('season search integration mock tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
