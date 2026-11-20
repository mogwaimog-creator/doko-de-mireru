'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const guard=require('../api/_acquisition-guard');
const {RESERVE}=require('../api/_new-work-ingest');
const redis=(...args)=>JSON.parse(execFileSync('redis-cli',['--json',...args.map(String)],{encoding:'utf8'}).trim());
const evalScript=(script,keys,args)=>redis('EVAL',script,keys.length,...keys,...args);
const control='doko:dev:content-control:v1',active='doko:dev:cutover:v1:active';
test('real Redis: new guard ignores old v1 pause and permits a bounded request',()=>{
 redis('FLUSHDB');
 redis('SET',control,JSON.stringify({status:'ready',newWorkDailyLimit:2}));
 redis('SET','doko:dev:acquisition-guard:v1',JSON.stringify({paused:true,inflight:999}));
 assert.equal(evalScript(guard.ENTER,[control,active],['t1',JSON.stringify({startedAt:Date.parse('2026-11-11T00:00:00Z')}),Date.parse('2026-11-11T00:00:00Z')]),1);
 const now=Date.parse('2026-11-11T00:00:00Z'),bucket=guard.KEY+':failure:1';
 // Production regular quota is 3000/day, not the obsolete test-only value of 2.
 redis('SET',guard.KEY,JSON.stringify({version:2,minute:Math.floor(now/60000),requests:0,acquisitions:0,scheduled:0,failures:0,day:'2026-11-11',daily:2998,dailyScheduled:0}));
 assert.deepEqual(evalScript(guard.ADMIT,[guard.KEY,control,bucket],['id1',now,'2026-11-11','0',2]),[1,'admitted']);
 assert.deepEqual(evalScript(guard.ADMIT,[guard.KEY,control,bucket],['id1',now,'2026-11-11','0',2]),[1,'admitted']);
 assert.deepEqual(evalScript(guard.ADMIT,[guard.KEY,control,bucket],['id1',now,'2026-11-11','0',2]),[0,'upstream-limit']);
 // Scheduled series updates use an independent quota and must not be blocked by public traffic.
 assert.deepEqual(evalScript(guard.ADMIT,[guard.KEY,control,bucket],['id1',now,'2026-11-11','1',2]),[1,'admitted']);
 const state=JSON.parse(redis('GET',guard.KEY));
 assert.equal(state.daily,3000);
 assert.equal(state.acquisitions,2);
 assert.equal(state.dailyScheduled,1);
 assert.equal(redis('HDEL',active,'t1'),1);
});
test('real Redis: per-work attempts do not reserve cumulative bytes',()=>{
 redis('FLUSHDB');
 redis('SET',control,JSON.stringify({status:'ready',newWorkDailyLimit:2}));
 const attempts='doko:dev:acquisition:v1:attempts:test',until=Date.now()+86400000;
 assert.deepEqual(evalScript(RESERVE,[control,attempts],[until]),[1,'counted']);
 assert.deepEqual(evalScript(RESERVE,[control,attempts],[until]),[1,'counted']);
 assert.deepEqual(evalScript(RESERVE,[control,attempts],[until]),[0,'daily-limit']);
 assert.equal(redis('EXISTS','doko:dev:acquisition:v1:reserved-bytes'),0);
});

test('real Redis: stale abandoned writer tickets are cleared but live tickets remain',()=>{
 redis('FLUSHDB');
 redis('SET',control,JSON.stringify({status:'ready'}));
 const now=Date.parse('2026-11-11T00:00:00Z');
 for(let i=0;i<64;i++)redis('HSET',active,'abandoned-'+i,JSON.stringify({startedAt:now-901000}));
 assert.equal(evalScript(guard.ENTER,[control,active],['fresh',JSON.stringify({startedAt:now}),now]),1);
 assert.equal(redis('HLEN',active),1);
 for(let i=0;i<63;i++)redis('HSET',active,'live-'+i,JSON.stringify({startedAt:now}));
 assert.equal(evalScript(guard.ENTER,[control,active],['blocked',JSON.stringify({startedAt:now}),now]),-1);
 assert.equal(redis('HLEN',active),64);
});
