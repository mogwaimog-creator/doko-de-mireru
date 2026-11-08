'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSeasonBatch}=require('../prototype/season-ledger-batch');
test('large show checkpoints, resumes and commits only when complete',async()=>{
 let stage=null,commits=0,calls=0;
 const run=createSeasonBatch({
  loadStage:async()=>stage,saveStage:async(_,s)=>{stage=structuredClone(s)},
  clearStage:async()=>{stage=null},
  fetchSeason:async(_,n)=>{calls++;return {episodes:[{episode_number:1,name:'episode '+n}]}},
  commit:async({completed})=>{commits++;assert.equal(Object.keys(completed).length,3);return true},
  maxPerRun:2
 });
 const args={tvId:12,seasonNumbers:[1,2,3],revision:'rev1'};
 assert.equal((await run(args)).status,'pending');
 assert.equal(commits,0);assert.equal(calls,2);
 assert.equal((await run(args)).status,'complete');
 assert.equal(commits,1);assert.equal(calls,3);assert.equal(stage,null);
});
test('manifest revision change discards incompatible staged data',async()=>{
 let stage={tvId:12,revision:'old',completed:{1:{episodes:[]}}};
 const run=createSeasonBatch({
  loadStage:async()=>stage,saveStage:async(_,s)=>{stage=s},clearStage:async()=>{stage=null},
  fetchSeason:async()=>({episodes:[]}),commit:async({revision})=>{assert.equal(revision,'new');return true}
 });
 assert.equal((await run({tvId:12,seasonNumbers:[1],revision:'new'})).status,'complete');
});
test('fetch failure does not commit incomplete data',async()=>{
 let stage=null,commits=0;
 const run=createSeasonBatch({
  loadStage:async()=>stage,saveStage:async(_,s)=>{stage=s},clearStage:async()=>{stage=null},
  fetchSeason:async(_,n)=>{if(n===2)throw Error('offline');return {episodes:[]}},
  commit:async()=>{commits++;return true}
 });
 const result=await run({tvId:12,seasonNumbers:[1,2],revision:'rev1',baseRecord:{old:true}});
 assert.equal(result.status,'failed');assert.equal(commits,0);assert.deepEqual(result.record,{old:true});
 assert.ok(stage.completed[1]);
});
