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
 assert.equal(evalScript(guard.ENTER,[control,active],['t1','{}']),1);
 const now=Date.parse('2026-11-11T00:00:00Z'),bucket=guard.KEY+':failure:1';
 assert.deepEqual(evalScript(guard.ADMIT,[guard.KEY,control,bucket],['id1',now,'2026-11-11','0',2]),[1,'admitted']);
 assert.deepEqual(evalScript(guard.ADMIT,[guard.KEY,control,bucket],['id1',now,'2026-11-11','0',2]),[1,'admitted']);
 assert.deepEqual(evalScript(guard.ADMIT,[guard.KEY,control,bucket],['id1',now,'2026-11-11','0',2]),[0,'upstream-limit']);
 assert.equal(redis('HDEL',active,'t1'),1);
});
test('real Redis: per-work attempts do not reserve cumulative bytes',()=>{
 redis('FLUSHDB');
 redis('SET',control,JSON.stringify({status:'ready',newWorkDailyLimit:2}));
 const attempts='doko:dev:acquisition:v1:attempts:2026-11-11',until=Date.parse('2026-11-13T00:00:00+09:00');
 assert.deepEqual(evalScript(RESERVE,[control,attempts],[until]),[1,'counted']);
 assert.deepEqual(evalScript(RESERVE,[control,attempts],[until]),[1,'counted']);
 assert.deepEqual(evalScript(RESERVE,[control,attempts],[until]),[0,'daily-limit']);
 assert.equal(redis('EXISTS','doko:dev:acquisition:v1:reserved-bytes'),0);
});
