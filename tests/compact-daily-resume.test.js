'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {sharedStore}=require('../api/_shared-streaming-store'),{compactDailyJobStore:dailyJobStore}=require('../api/_compact-daily-job-store'),{dailyJob}=require('../api/_streaming-daily-job');
const {command}=require('./helpers/local-redis');
const at='2026-11-09T00:00:00Z',payload={results:{JP:{flatrate:[],rent:[],buy:[]}}};
const works=[635302,1771,1726,671].map(id=>({type:'movie',id,memberships:[{kind:'watchOrder',scope:'test'}]}));
function local(name,fn){test(name,{skip:!process.env.REDIS_TEST_CLI},async()=>{const prefix=`doko:dev:resume:${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}:`;const records=sharedStore(command,{prefix:prefix+'records:'}),jobs=dailyJobStore(command,{prefix:prefix+'compact:',enforceCurrentDay:false});await fn({records,jobs,prefix})})}
local('compact daily update completes all 266 real work IDs over several isolated invocations with no repeat fetch',async({records,jobs})=>{
 const all=require('../scripts/audit-shared-ledgers').inventory().records;let loads=0;const fetch=async()=>{loads++;return payload};
 let result=await dailyJob(records,jobs,fetch,{chunkSize:12}).run(at,all,{maxItems:37});assert.equal(result.status,'paused');assert.equal(result.attempted,37);
 result=await dailyJob(records,jobs,fetch,{chunkSize:12}).run(at,all);assert.equal(result.status,'complete');assert.equal(result.succeeded,266);assert.equal(result.pending,0);assert.equal(loads,266);
 assert.equal((await dailyJob(records,jobs,fetch).run(at,all)).reason,'already-finished');assert.equal(loads,266);
 const manifest=await jobs.read('2026-11-09');assert.equal(Object.keys(manifest.completed).length,266);assert.equal(result.dispatches,266);
});
local('resume reconciles committed records after outcome checkpoint fails, without refetch',async({records,jobs})=>{
 let loads=0,fail=true;const fetch=async()=>{loads++;return payload};
 const broken={...jobs,checkpoint:async(...args)=>{if(fail&&Object.keys(args[3].completed).length){fail=false;throw Error('checkpoint connection lost')}return jobs.checkpoint(...args)}};
 await assert.rejects(dailyJob(records,broken,fetch,{chunkSize:2}).run(at,works),/checkpoint connection lost/);assert.equal(loads,2);
 const result=await dailyJob(records,jobs,fetch,{chunkSize:2}).run(at,works);assert.equal(result.status,'complete');assert.equal(loads,4);assert.equal(result.dispatches,4);
});
local('normal recorded provider failures finish as complete-with-errors and are not retried that day',async({records,jobs})=>{
 let loads=0;const fetch=async(type,id)=>{loads++;if(id===635302)throw Error('upstream fixture failure');return payload};
 const result=await dailyJob(records,jobs,fetch).run(at,works);assert.equal(result.status,'complete-with-errors');assert.equal(result.failed,1);assert.equal(result.pending,0);
 await dailyJob(records,jobs,fetch).run(at,works);assert.equal(loads,4);
 const failed=await records.read('movie:635302');assert.equal(failed.lastSuccessAt,null);assert.equal(failed.lastSeriesRunDay,'2026-11-09');
});
local('persistent intent caps repeated storage-failure dispatches across restarts',async({records,jobs})=>{
 const broken={...records,saveAndRelease:async()=>{throw Error('storage disconnected')}};let loads=0;const fetch=async()=>{loads++;return payload};
 for(let i=0;i<2;i++)assert.equal((await dailyJob(broken,jobs,fetch,{maxDispatchesPerWork:2}).run(at,works)).status,'paused');
 const last=await dailyJob(broken,jobs,fetch,{maxDispatchesPerWork:2}).run(at,works);assert.equal(last.reason,'dispatch-budget');assert.equal(loads,8);assert.equal(last.pending,4);assert.equal(last.dispatches,8);
});
local('changed roster is rejected without replacing the saved manifest; before six creates no journal',async({records,jobs})=>{
 const fetch=async()=>payload;
 assert.equal((await dailyJob(records,jobs,fetch).run('2026-11-08T20:59:59Z',works)).status,'not-due');assert.equal(await jobs.read('2026-11-09'),null);
 await dailyJob(records,jobs,fetch).run(at,works,{maxItems:1});const before=await jobs.read('2026-11-09');
 await assert.rejects(dailyJob(records,jobs,fetch).run(at,works.slice(0,2)),/roster changed/);assert.deepEqual(await jobs.read('2026-11-09'),before);
});
local('killed job process resumes after lease expiry from persisted progress',async({records,jobs,prefix})=>{
 const {spawn}=require('node:child_process'),{once}=require('node:events'),path=require('node:path');
 const code=`const {command}=require('./tests/helpers/local-redis');const {sharedStore}=require('./api/_shared-streaming-store');const {compactDailyJobStore:dailyJobStore}=require('./api/_compact-daily-job-store');const {dailyJob}=require('./api/_streaming-daily-job');const prefix=process.argv[1],works=JSON.parse(process.argv[2]);dailyJob(sharedStore(command,{prefix:prefix+'records:'}),dailyJobStore(command,{prefix:prefix+'compact:',enforceCurrentDay:false}),async()=>({results:{JP:{}}}),{chunkSize:2,leaseMs:300,onCheckpoint:async job=>{if(Object.keys(job.completed).length===2){console.log('checkpoint');setInterval(()=>{},1000);await new Promise(()=>{})}}}).run('2026-11-09T00:00:00Z',works).catch(e=>{console.error(e);process.exit(2)})`;
 const child=spawn(process.execPath,['-e',code,prefix,JSON.stringify(works)],{cwd:path.join(__dirname,'..'),env:process.env,stdio:['ignore','pipe','pipe']});let timer;
 try{await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('child job timeout')),5000)})]);const ended=once(child,'exit');child.kill('SIGKILL');await ended;await new Promise(r=>setTimeout(r,350));
  let loads=0;const result=await dailyJob(records,jobs,async()=>{loads++;return payload},{chunkSize:2}).run(at,works);assert.equal(result.status,'complete');assert.equal(loads,2);assert.equal(result.dispatches,4);
 }finally{clearTimeout(timer);child.kill('SIGKILL')}
});
local('time-budget and abort pause durably and resume the remaining records',async({records,jobs})=>{
 let time=0;const runner=dailyJob(records,jobs,async()=>payload,{chunkSize:1,budgetMs:10,clock:()=>time,onCheckpoint:async job=>{if(Object.keys(job.completed).length===1)time=20}});
 const paused=await runner.run(at,works);assert.equal(paused.status,'paused');assert.equal(paused.attempted,1);
 const ac=new AbortController();ac.abort();const aborted=await dailyJob(records,jobs,async()=>payload).run(at,works,{signal:ac.signal});assert.equal(aborted.reason,'aborted');assert.equal(aborted.attempted,1);
 assert.equal((await dailyJob(records,jobs,async()=>payload).run(at,works)).status,'complete');
});
local('next-day job refreshes the whole roster while preserving a paused prior-day journal',async({records,jobs})=>{
 let loads=0;const fetch=async()=>{loads++;return payload};await dailyJob(records,jobs,fetch).run(at,works,{maxItems:1});const previous=await jobs.read('2026-11-09');
 const result=await dailyJob(records,jobs,fetch).run('2026-11-10T00:00:00Z',works);assert.equal(result.status,'complete');assert.equal(loads,5);assert.deepEqual(await jobs.read('2026-11-09'),previous);
});
local('expired job owner cannot checkpoint or release the new lease; concurrent invocation is busy',async({records,jobs})=>{
 const day='2026-11-09',initial={schemaVersion:1,day,manifestHash:'fixed',keys:[],completed:{},dispatches:{},revision:0,status:'pending'};
 assert((await jobs.claim(day,'old-owner',20,initial)).acquired);await new Promise(r=>setTimeout(r,30));assert((await jobs.claim(day,'new-owner',3000,initial)).acquired);
 assert.equal(await jobs.checkpoint(day,'old-owner',0,{...initial,revision:1}),false);assert.equal(await jobs.release(day,'old-owner'),false);assert.equal((await dailyJob(records,jobs,async()=>payload).run(at,works)).status,'busy');assert(await jobs.release(day,'new-owner'));
});
