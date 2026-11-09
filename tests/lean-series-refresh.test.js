'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {leanSeriesRefresh,COMMIT}=require('../api/_lean-series-refresh');
const {sharedStore}=require('../api/_shared-streaming-store');
const {command}=require('./helpers/local-redis');
const at='2026-11-09T00:00:00Z',clock=()=>Date.parse(at),payload={results:{JP:{flatrate:[{provider_id:8,provider_name:'Fixture'}],rent:[],buy:[]}}};
const works=require('../scripts/audit-shared-ledgers').inventory().records;
function local(name,fn){test(name,{skip:!process.env.REDIS_TEST_CLI},async()=>{const prefix=`doko:dev:lean:${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}:`;await fn({prefix,options:{prefix,controlKey:prefix+'control',clock}})})}
local('batch 266 protected work IDs: 20 RPC, no repeat on same JST day',async({prefix,options})=>{
 let calls=0,loads=0;const runner=leanSeriesRefresh(async args=>{calls++;return command(args)},async()=>{loads++;return payload},options);
 const result=await runner.run(at,works);assert.equal(result.status,'complete');assert.equal(result.succeeded,266);assert.equal(calls,20);assert.equal(loads,266);
 assert.equal((await runner.run(at,works)).reason,'already-finished');assert.equal(loads,266);
 const saved=JSON.parse(await command(['GET',prefix+'record:movie:635302']));assert(Array.isArray(saved.japan.rent));assert.equal(saved.lastSeriesRunDay,'2026-11-09');
});
local('37 item pause resumes with no duplicate upstream fetch',async({options})=>{
 let loads=0;const runner=leanSeriesRefresh(command,async()=>{loads++;return payload},options);
 assert.equal((await runner.run(at,works,{maxItems:37})).status,'paused');assert.equal(loads,37);
 assert.equal((await runner.run(at,works)).status,'complete');assert.equal(loads,266);
});
local('multiple workers and individual writers share a two-way batch fence',async({prefix,options})=>{
 let resume,started;const gate=new Promise(r=>resume=r),ready=new Promise(r=>started=r);let loads=0;
 const runner=leanSeriesRefresh(command,async()=>{loads++;started();await gate;return payload},options),active=runner.run(at,works.slice(0,2));
 await ready;try{assert.equal((await runner.run(at,works.slice(0,2))).status,'busy');const individual=sharedStore(command,{prefix});assert.equal((await individual.claimAndRead('movie:635302','other',30000)).acquired,false);assert.equal(await individual.acquire('movie:635302','other',30000),false)}finally{resume()}
 assert.equal((await active).status,'complete');assert.equal(loads,2);
});
local('already held individual lock prevents batch fetch',async({prefix,options})=>{
 const individual=sharedStore(command,{prefix});assert(await individual.acquire('movie:635302','other',30000));
 let loads=0;const result=await leanSeriesRefresh(command,async()=>{loads++;return payload},options).run(at,works);assert.equal(result.reason,'work-busy');assert.equal(loads,0);
});
local('shared pause blocks fetch and mid-batch pause prevents writes',async({prefix,options})=>{
 await command(['SET',options.controlKey,JSON.stringify({status:'paused'})]);let loads=0;const runner=leanSeriesRefresh(command,async()=>{loads++;return payload},options);
 assert.equal((await runner.run(at,works)).status,'stopped');assert.equal(loads,0);
 await command(['SET',options.controlKey,JSON.stringify({status:'ready'})]);const paused=leanSeriesRefresh(command,async()=>{await command(['SET',options.controlKey,JSON.stringify({status:'paused'})]);return payload},options);
 assert.equal((await paused.run(at,works.slice(0,1))).reason,'commit-fenced');assert.equal(await command(['GET',prefix+'record:'+works[0].type+':'+works[0].id]),null);
});
local('record/progress atomic commit survives lost acknowledgement without repeat',async({options})=>{
 let fail=true,loads=0;const cmd=async args=>{const value=await command(args);if(args[1]===COMMIT&&fail){fail=false;throw Error('lost ack')}return value};
 const fetch=async()=>{loads++;return payload};await assert.rejects(leanSeriesRefresh(cmd,fetch,options).run(at,works),/lost ack/);
 assert.equal(loads,32);assert.equal((await leanSeriesRefresh(command,fetch,options).run(at,works)).status,'complete');assert.equal(loads,266);
});
local('persistent dispatch cap stops repeated failed saves across restarts',async({options})=>{
 let loads=0;const cmd=async args=>{if(args[1]===COMMIT)throw Error('storage outage');return command(args)},fetch=async()=>{loads++;return payload};
 for(let i=0;i<2;i++)await assert.rejects(leanSeriesRefresh(cmd,fetch,options).run(at,works.slice(0,2)),/storage outage/);
 const result=await leanSeriesRefresh(command,fetch,options).run(at,works.slice(0,2));assert.equal(result.reason,'dispatch-budget');assert.equal(result.status,'stopped');assert.equal(loads,4);
});
local('manual concurrent write is preserved by compare-and-swap',async({prefix,options})=>{
 const row=works[0],key=prefix+'record:'+row.type+':'+row.id;
 const result=await leanSeriesRefresh(command,async()=>{await command(['SET',key,'manual-protected']);return payload},options).run(at,[row]);assert.equal(result.reason,'commit-fenced');assert.equal(await command(['GET',key]),'manual-protected');
});
local('expired batch owner cannot commit or release a replacement owner',async({prefix,options})=>{
 const result=await leanSeriesRefresh(command,async()=>{await command(['SET',prefix+'series-batch-lease','replacement','PX','30000']);return payload},options).run(at,works.slice(0,1));assert.equal(result.reason,'commit-fenced');assert.equal(await command(['GET',prefix+'series-batch-lease']),'replacement');
});
local('failure keeps previous availability and is not retried that day',async({prefix,options})=>{
 const row=works[0],one=[row];await leanSeriesRefresh(command,async()=>payload,options).run(at,one);
 const tomorrow='2026-11-10T00:00:00Z';let loads=0;const runner=leanSeriesRefresh(command,async()=>{loads++;throw Error('fixture failure')},{...options,clock:()=>Date.parse(tomorrow)});
 assert.equal((await runner.run(tomorrow,one)).status,'complete-with-errors');await runner.run(tomorrow,one);assert.equal(loads,1);
 const record=JSON.parse(await command(['GET',prefix+'record:'+row.type+':'+row.id]));assert.equal(record.lastSuccessAt,new Date(at).toISOString());assert.equal(record.japan.flatrate[0].providerId,8);
});
local('roster mutation and malformed prior record stop safely before upstream',async({prefix,options})=>{
 const runner=leanSeriesRefresh(command,async()=>payload,options);await runner.run(at,works,{maxItems:1});await assert.rejects(runner.run(at,works.slice(0,2)),/roster/);
 await command(['SET',prefix+'record:'+works[1].type+':'+works[1].id,'{"schemaVersion":1,"type":"movie","id":-1}']);await assert.rejects(runner.run(at,works),/invalid saved record/);
});
local('before six, abort and constrained time budget never fetch',async({options})=>{
 let loads=0;const runner=leanSeriesRefresh(command,async()=>{loads++;return payload},{...options,budgetMs:1});
 assert.equal((await runner.run('2026-11-08T20:59:59Z',works)).status,'not-due');assert.equal((await runner.run(at,works)).reason,'time-budget');
 const ac=new AbortController();ac.abort();assert.equal((await runner.run(at,works,{signal:ac.signal})).reason,'aborted');assert.equal(loads,0);
});
test('production constructor and unsafe limits are refused',()=>{assert.throws(()=>leanSeriesRefresh(command,async()=>payload,{prefix:'production:'}),/limits/);assert.throws(()=>leanSeriesRefresh(command,async()=>payload,{leaseMs:1}),/limits/)});
local('killed batch process resumes after actual lease expiry without repeating committed work',async({prefix,options})=>{
 const {spawn}=require('node:child_process'),{once}=require('node:events');
 const code=`const {command}=require('./tests/helpers/local-redis'),{leanSeriesRefresh}=require('./api/_lean-series-refresh');const prefix=process.argv[1],works=JSON.parse(process.argv[2]);leanSeriesRefresh(command,async()=>({results:{JP:{}}}),{prefix,controlKey:prefix+'control',clock:()=>Date.parse('2026-11-09T00:00:00Z'),batchSize:1,concurrency:1,timeoutMs:1,leaseMs:1020,onCommit:async()=>{console.log('committed');setInterval(()=>{},1000);await new Promise(()=>{})}}).run('2026-11-09T00:00:00Z',works).catch(e=>{console.error(e);process.exit(2)})`;
 const child=spawn(process.execPath,['-e',code,prefix,JSON.stringify(works.slice(0,2))],{cwd:require('node:path').join(__dirname,'..'),env:process.env,stdio:['ignore','pipe','pipe']});let timer;
 try{await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('child checkpoint timeout')),5000))]);const ended=once(child,'exit');child.kill('SIGKILL');await ended;await new Promise(r=>setTimeout(r,1100));let loads=0;const result=await leanSeriesRefresh(command,async()=>{loads++;return payload},options).run(at,works.slice(0,2));assert.equal(result.status,'complete');assert.equal(loads,1);assert.equal(result.dispatches,2)}finally{clearTimeout(timer);child.kill('SIGKILL')}
});
local('wire progress sends only changed keys while persisted journals retain the full roster and resume state',async({prefix,options})=>{
 const {INTENT,COMMIT}=require('../api/_lean-series-refresh');let deltaBytes=0,fullBytes=0;
 const send=async args=>{if([INTENT,COMMIT].includes(args[1])){const delta=JSON.parse(args[5+Number(args[2])]);assert.equal(delta.wireVersion,1);assert.equal(delta.keys,undefined);assert(Object.keys(delta.sent).length<=32);assert(Object.keys(delta.done).length<=32);deltaBytes+=Buffer.byteLength(JSON.stringify(delta))}return command(args)};
 const runner=leanSeriesRefresh(send,async()=>payload,{...options,onIntent:async job=>{fullBytes+=Buffer.byteLength(JSON.stringify(job))},onCommit:async job=>{fullBytes+=Buffer.byteLength(JSON.stringify(job))}});
 assert.equal((await runner.run(at,works)).status,'complete');assert(deltaBytes<fullBytes/2);const saved=JSON.parse(await command(['GET',runner.keys.jobKey('2026-11-09')]));assert.equal(saved.keys.length,266);assert.equal(Object.keys(saved.done).length,266);assert.equal(Object.keys(saved.sent).length,266);assert.equal(saved.wireVersion,undefined);
});
