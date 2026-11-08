'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {command}=require('./helpers/local-redis'),{compactDailyJobStore}=require('../api/_compact-daily-job-store'),{sharedStore}=require('../api/_shared-streaming-store'),{dailyJob}=require('../api/_streaming-daily-job'),{supervisor}=require('../api/_daily-job-supervisor');
const at='2026-11-09T00:00:00Z',day='2026-11-09',works=[{type:'movie',id:635302,memberships:[{kind:'watchOrder',scope:'test'}]}];
function local(name,fn){test(name,{skip:!process.env.REDIS_TEST_CLI},async()=>{const prefix=`doko:dev:retention:${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}:`;await fn(prefix)})}
local('v2 TTL is fixed at creation, partial progress survives reclaim, and old v1 data is untouched',async prefix=>{
 const jobs=compactDailyJobStore(command,{prefix:prefix+'v2:',clock:()=>Date.parse(at)}),records=sharedStore(command,{prefix:prefix+'records:'});
 await dailyJob(records,jobs,async()=>({results:{JP:{flatrate:[],rent:[],buy:[]}}})).run(at,works,{maxItems:0});const ttl=await command(['PTTL',jobs.keys.dayKey(day)]);assert(ttl<=14*86400000&&ttl>14*86400000-5000);
 await command(['PEXPIRE',jobs.keys.dayKey(day),'100000']);await dailyJob(records,jobs,async()=>({results:{JP:{flatrate:[],rent:[],buy:[]}}})).run(at,works);assert((await command(['PTTL',jobs.keys.dayKey(day)]))<=100000);assert.equal((await jobs.read(day)).status,'complete');
 const legacy=prefix+'v1:'+day;await command(['SET',legacy,'preserve-old']);const guarded=compactDailyJobStore(command,{prefix:prefix+'other-v2:',legacyPrefix:prefix+'v1:',clock:()=>Date.parse(at)});await assert.rejects(dailyJob(records,guarded,async()=>{throw Error('must not load')}).run(at,works),/v1 journal/);assert.equal(await command(['GET',legacy]),'preserve-old');assert.equal(await command(['PTTL',legacy]),-1);
});
local('expired journal cannot accept checkpoint or recreate an old day',async prefix=>{
 let now=Date.parse(at);const jobs=compactDailyJobStore(command,{prefix,clock:()=>now});const init={schemaVersion:1,day,manifestHash:'fixed',keys:[],completed:{},dispatches:{},status:'pending',revision:0,createdAt:at,updatedAt:at,invocations:0};assert((await jobs.claim(day,'owner',1000,init)).acquired);await command(['PEXPIRE',jobs.keys.dayKey(day),'1']);await new Promise(r=>setTimeout(r,5));assert.equal(await jobs.checkpoint(day,'owner',0,{...init,revision:1}),false);now+=15*86400000;await assert.rejects(jobs.claim(day,'late',1000,init),/current JST day/);assert.equal(await jobs.read(day),null);await jobs.release(day,'owner');
});
local('supervisor resumes all 266 actual IDs automatically with bounded chunks and no duplicate fetch',async prefix=>{
 const works=require('../scripts/audit-shared-ledgers').inventory().records,records=sharedStore(command,{prefix:prefix+'records:'}),jobs=compactDailyJobStore(command,{prefix:prefix+'jobs:',clock:()=>Date.parse(at)});let loads=0;
 const make=()=>dailyJob(records,jobs,async()=>{loads++;return {results:{JP:{flatrate:[],rent:[],buy:[]}}}});const first=await supervisor(make(),{maxInvocations:2}).run(at,works,{maxItems:24});assert.equal(first.reason,'invocation-budget');assert.equal(loads,48);
 const final=await supervisor(make()).run(at,works,{maxItems:24});assert.equal(final.status,'complete');assert.equal(final.last.succeeded,266);assert.equal(loads,266);assert.equal(final.invocations,10);
});
local('persistent daily invocation cap stops fresh supervisors from bypassing the limit',async prefix=>{
 const jobs=compactDailyJobStore(command,{prefix:prefix+'jobs:',clock:()=>Date.parse(at)}),records=sharedStore(command,{prefix:prefix+'records:'});let loads=0;const make=()=>dailyJob(records,jobs,async()=>{loads++;return {results:{JP:{flatrate:[]}}}},{maxJobInvocations:2});
 for(let i=0;i<3;i++)await supervisor(make()).run(at,works,{maxItems:0});assert.equal((await jobs.read(day)).invocations,2);assert.equal(loads,0);
});
test('supervisor stops on storage, dispatch, normal failures, busy and abort without spinning',async()=>{
 for(const result of [{status:'paused',reason:'retry-required'},{status:'paused',reason:'dispatch-budget'},{status:'busy',reason:'lease'},{status:'complete-with-errors',reason:'finished'}]){let calls=0;await supervisor({run:async()=>{calls++;return result}}).run(at,works);assert.equal(calls,1)}
 let calls=0;const failed=await supervisor({run:async()=>{calls++;throw Error('storage disconnected')}}).run(at,works);assert.equal(failed.reason,'storage-or-journal-error');assert.equal(calls,1);
 const ac=new AbortController();ac.abort();assert.equal((await supervisor({run:()=>{throw Error('unexpected')}}).run(at,works,{signal:ac.signal})).reason,'aborted');
});
local('packed journal backup restores exact progress and original expiry without touching source',async prefix=>{
 const jobs=compactDailyJobStore(command,{prefix:prefix+'source:',clock:()=>Date.parse(at)}),records=sharedStore(command,{prefix:prefix+'records:'});await dailyJob(records,jobs,async()=>({results:{JP:{flatrate:[],rent:[],buy:[]}}})).run(at,works);
 const source=jobs.keys.dayKey(day),fields=await command(['HGETALL',source]),expiresAt=await command(['PEXPIRETIME',source]);const backup=JSON.parse(JSON.stringify({fields,expiresAt}));
 const restored=compactDailyJobStore(command,{prefix:prefix+'restore:',clock:()=>Date.parse(at)}),key=restored.keys.dayKey(day);await command(['HSET',key,...Object.entries(backup.fields).flat()]);await command(['PEXPIREAT',key,String(backup.expiresAt)]);
 assert.deepEqual(await restored.read(day),await jobs.read(day));assert.equal(await command(['PEXPIRETIME',key]),expiresAt);assert.equal(await command(['PEXPIRETIME',source]),expiresAt);assert.deepEqual(await command(['HGETALL',source]),fields);
});
