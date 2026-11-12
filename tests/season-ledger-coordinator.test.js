'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSeasonCoordinator}=require('../prototype/season-ledger-coordinator');
const show={status:'Ended',seasons:[{season_number:1,name:'第1期',episode_count:1},{season_number:2,name:'第2期',episode_count:1}]};
function harness({maxPerRun=1,failSeason=null,casResult=true}={}){
 let record=null,stage=null,locked=false,fetches=0,writes=0,acquires=0;
 const get=createSeasonCoordinator({
  read:async()=>record,loadStage:async()=>stage,saveStage:async(_,v)=>{stage=structuredClone(v)},
  clearStage:async()=>{stage=null},fetchShow:async()=>show,
  fetchSeason:async(_,n)=>{fetches++;if(n===failSeason)throw Error('fetch failure');return {episodes:[{episode_number:1,name:'話'+n,runtime:42}]}},
  acquireLock:async()=>{acquires++;if(locked)return null;locked=true;return 'token'},
  releaseLock:async()=>{locked=false},
  compareAndSwap:async(_,old,next,token)=>{assert.equal(token,'token');if(!casResult||record!==old)return false;record=next;writes++;return true},
  now:()=>new Date('2026-11-08T00:00:00.000Z'),maxPerRun
 });
 return {get,state:()=>({record,stage,locked,fetches,writes,acquires})};
}
test('multi-run staging publishes only complete season snapshots',async()=>{
 const h=harness();
 assert.equal((await h.get(123)).source,'pending');
 assert.equal(h.state().record,null);assert.equal(h.state().fetches,1);
 assert.equal((await h.get(123)).source,'updated');
 assert.equal(h.state().record.refreshDays,90);assert.equal(h.state().fetches,2);
 assert.equal(h.state().stage,null);
 assert.equal((await h.get(123)).source,'cache');
 assert.equal(h.state().writes,1);
});
test('fetch failure retains stage and releases lock',async()=>{
 const h=harness({failSeason:2});
 assert.equal((await h.get(123)).source,'pending');
 assert.equal((await h.get(123)).source,'failed');
 assert.equal(h.state().record,null);
 assert.equal(h.state().locked,false);
 assert.ok(h.state().stage.completed[1]);
});
test('rejected compare-and-swap does not publish and leaves staged data',async()=>{
 const h=harness({maxPerRun:3,casResult:false});
 assert.equal((await h.get(123)).source,'failed');
 assert.equal(h.state().writes,0);
 assert.ok(h.state().stage);
 assert.equal(h.state().locked,false);
});
test('invalid TV IDs never acquire lock',async()=>{
 const h=harness();
 await assert.rejects(h.get(0),/invalid TV ID/);
 assert.equal(h.state().acquires,0);
});
