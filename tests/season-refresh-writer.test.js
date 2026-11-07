'use strict';
const assert=require('node:assert/strict');
const {createSeasonRefreshWriter}=require('../api/_season-refresh-writer');
const now=Date.parse('2026-11-07T00:00:00Z');
const old={type:'tv',id:17,seasonNumber:1,seasonName:'Old',episodes:[],
 checkedAt:'2026-10-01T00:00:00Z',status:'airing'};
const next={...old,seasonName:'New',checkedAt:new Date(now).toISOString()};
const previous=process.env.LEDGER_WRITES_RESUME;
(async()=>{
 const map=new Map(),calls=[];
 const dataKey='doko:season:v1:tv:17:1',lockKey=dataKey+':refresh-lock';
 map.set(dataKey,JSON.stringify(old));
 const command=async args=>{
  calls.push(args);const [op,...a]=args;
  if(op==='GET')return map.get(a[0])??null;
  if(op==='SET'){if(a.includes('NX')&&map.has(a[0]))return null;map.set(a[0],a[1]);return 'OK';}
  if(op==='EVAL'){
   const [script,num,...rest]=a;
   if(num==='1'){if(map.get(rest[0])===rest[1])map.delete(rest[0]);return 1;}
   if(num==='2'){const [key,lock,owner,value]=rest;if(map.get(lock)!==owner)return null;map.set(key,value);return 'OK';}
  }
  throw Error('Unexpected command '+op);
 };
 const writer=createSeasonRefreshWriter(command,{now:()=>now,token:()=> 'owner-1'});
 try{
  delete process.env.LEDGER_WRITES_RESUME;
  await assert.rejects(writer(old,async()=>next),e=>e.code==='SEASON_LEDGER_WRITES_FROZEN');
  assert.equal(calls.length,0);
  process.env.LEDGER_WRITES_RESUME='1';
  map.set(lockKey,'other-owner');
  assert.equal(await writer(old,async()=>{throw Error('should not fetch');}),null);
  assert.equal(map.get(lockKey),'other-owner');
  map.delete(lockKey);
  let loaded=0;
  assert.equal((await writer(old,async()=>{loaded++;return next;})).seasonName,'New');
  assert.equal(loaded,1);
  assert.equal(JSON.parse(map.get(dataKey)).seasonName,'New');
  assert.equal(map.has(lockKey),false);
  assert.equal((await writer(old,async()=>{throw Error('fresh should not fetch');})).seasonName,'New');
  map.set(dataKey,JSON.stringify(old));
  await assert.rejects(writer(old,async()=>{throw Error('TMDB down');}),/TMDB down/);
  assert.equal(JSON.parse(map.get(dataKey)).seasonName,'Old');
  assert.equal(map.has(lockKey),false);
  map.set(dataKey,JSON.stringify(old));
  await assert.rejects(writer(old,async()=>({...next,id:999})),/Invalid refreshed/);
  assert.equal(JSON.parse(map.get(dataKey)).seasonName,'Old');
  assert.ok(calls.some(c=>c[0]==='EVAL'&&c[2]==='2'),'atomic owner-checked write required');
  console.log('season refresh Redis lock mock tests passed');
 }finally{
  if(previous===undefined)delete process.env.LEDGER_WRITES_RESUME;
  else process.env.LEDGER_WRITES_RESUME=previous;
 }
})().catch(e=>{console.error(e);process.exitCode=1});
