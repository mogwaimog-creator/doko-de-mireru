'use strict';
const assert=require('node:assert/strict');
const {getCachedSeason}=require('../api/_season-ledger-cache');
const {createSeasonRefreshWriter}=require('../api/_season-refresh-writer');
const now=Date.parse('2026-11-07T00:00:00Z'),day=86400000;
const dataKey='doko:season:v1:tv:77:1',lockKey=dataKey+':refresh-lock';
const old={type:'tv',id:77,seasonNumber:1,seasonName:'old',episodes:[],
 checkedAt:new Date(now-8*day).toISOString(),status:'airing'};
const payload={season_number:1,name:'new',episodes:[{episode_number:1,name:'Updated'}]};
(async()=>{
 const map=new Map([[dataKey,JSON.stringify(old)]]);
 const calls=[];
 const command=async args=>{
  calls.push(args);const [op,...a]=args;
  if(op==='GET')return map.get(a[0])??null;
  if(op==='SET'){if(a.includes('NX')&&map.has(a[0]))return null;map.set(a[0],a[1]);return 'OK';}
  if(op==='EVAL'){
   const [script,count,...values]=a;
   if(count==='1'){if(map.get(values[0])===values[1])map.delete(values[0]);return 1;}
   if(count==='2'){const [key,lock,owner,value]=values;if(map.get(lock)!==owner)return null;map.set(key,value);return 'OK';}
  }
  throw Error('Unexpected command');
 };
 const getRecord=async()=>JSON.parse(map.get(dataKey));
 const writer=createSeasonRefreshWriter(command,{now:()=>now,token:()=> 'mock-owner'});
 const original=process.env.LEDGER_WRITES_RESUME;
 let fetched=0;
 const fetchSeason=async()=>{fetched++;return payload;};
 const request=()=>getCachedSeason({type:'tv',id:77,seasonNumber:1,getRecord,
  putRecordIfAbsent:async()=>{throw Error('should not create');},
  fetchSeason,refreshRecord:writer,now});
 try{
  delete process.env.LEDGER_WRITES_RESUME;
  let result=await request();
  assert.equal(result.season_name,'old');
  assert.equal(fetched,0);
  assert.equal(calls.length,0,'write freeze must not attempt lock');
  process.env.LEDGER_WRITES_RESUME='1';
  result=await request();
  assert.equal(result.season_name,'new');
  assert.equal(fetched,1);
  assert.equal(JSON.parse(map.get(dataKey)).seasonName,'new');
  result=await request();
  assert.equal(result.season_name,'new');
  assert.equal(fetched,1,'fresh cache must not refetch');
  map.set(dataKey,JSON.stringify(old));
  map.set(lockKey,'other-owner');
  result=await request();
  assert.equal(result.season_name,'old');
  assert.equal(fetched,1,'contended lock must not refetch');
  map.delete(lockKey);
  map.set(dataKey,JSON.stringify(old));
  const failing=await getCachedSeason({type:'tv',id:77,seasonNumber:1,getRecord,
   putRecordIfAbsent:async()=>{throw Error('should not create');},
   fetchSeason:async()=>{throw Error('TMDB down');},refreshRecord:writer,now});
  assert.equal(failing.season_name,'old');
  assert.equal(JSON.parse(map.get(dataKey)).seasonName,'old');
  console.log('season refresh cache-writer integration mock tests passed');
 }finally{
  if(original===undefined)delete process.env.LEDGER_WRITES_RESUME;
  else process.env.LEDGER_WRITES_RESUME=original;
 }
})().catch(e=>{console.error(e);process.exitCode=1});
