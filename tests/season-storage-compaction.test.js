'use strict';
const assert=require('node:assert/strict');
const {compactRecord,createSeasonRedisAdapter}=require('../api/_season-ledger-redis');
const {createSeasonRefreshWriter}=require('../api/_season-refresh-writer');
const day=86400000,now=Date.parse('2026-11-07T00:00:00Z');
const old={type:'tv',id:77,seasonNumber:1,seasonName:'Season 1',
 checkedAt:new Date(now-8*day).toISOString(),status:'airing',
 episodes:[{episodeNumber:1,title:'Episode',overview:'legacy synopsis',airDate:null,runtimeMinutes:24}]};
const clean=compactRecord(old);
assert.equal(old.episodes[0].overview,'legacy synopsis','do not mutate input');
assert.equal(Object.hasOwn(clean.episodes[0],'overview'),false);
assert.equal(clean.episodes[0].runtimeMinutes,24);
(async()=>{
 const prev=process.env.LEDGER_WRITES_RESUME;
 process.env.LEDGER_WRITES_RESUME='1';
 try{
  let created;
  const adapter=createSeasonRedisAdapter(async args=>{assert.equal(args[0],'SET');created=JSON.parse(args[2]);return 'OK';});
  assert.equal(await adapter.putRecordIfAbsent(old),true);
  assert.equal(Object.hasOwn(created.episodes[0],'overview'),false,'initial write must compact');
  const dataKey='doko:season:v1:tv:77:1';
  const lockKey=dataKey+':refresh-lock';
  const map=new Map([[dataKey,JSON.stringify(old)]]);
  const command=async args=>{
   if(args[0]==='SET'){if(args.includes('NX')&&map.has(args[1]))return null;map.set(args[1],args[2]);return 'OK';}
   if(args[0]==='GET')return map.get(args[1])??null;
   if(args[0]==='EVAL'){
    if(args[2]==='2'){if(map.get(args[4])!==args[5])return null;map.set(args[3],args[6]);return 'OK';}
    if(args[2]==='1'){if(map.get(args[3])===args[4])map.delete(args[3]);return 1;}
   }
   throw Error('Unexpected Redis mock command '+args[0]);
  };
  const writer=createSeasonRefreshWriter(command,{now:()=>now,token:()=> 'owner'});
  const result=await writer(old,async()=>({...old,checkedAt:new Date(now).toISOString()}));
  assert.ok(result);
  assert.equal(Object.hasOwn(result.episodes[0],'overview'),false,'refresh result must compact');
  assert.equal(Object.hasOwn(JSON.parse(map.get(dataKey)).episodes[0],'overview'),false,'refresh write must compact');
  assert.equal(map.has(lockKey),false,'lock must be released');
  console.log('season storage compaction initial/refresh mock tests passed');
 }finally{if(prev===undefined)delete process.env.LEDGER_WRITES_RESUME;else process.env.LEDGER_WRITES_RESUME=prev;}
})().catch(e=>{console.error(e);process.exitCode=1});
