'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const guardModule=require('../api/_acquisition-guard');
const work=require('../api/_new-work-ingest');
const transport=require('../api/_release-transport-candidate');

test('reservation-free guard scripts are registered and obsolete scripts are absent',()=>{
 const scripts=transport.coreScripts().map(x=>x.script);
 for(const name of ['ENTER','ADMIT','FAILURE'])assert.ok(scripts.includes(guardModule[name]),name);
 assert.ok(scripts.includes(work.RESERVE));
 assert.equal('FINISH' in guardModule,false);
 assert.equal('TRIP' in guardModule,false);
 assert.equal('SETTLE' in work,false);
 assert.doesNotMatch(guardModule.ADMIT,/inflight|commandReservation|byteReservation|paused=true/);
 assert.doesNotMatch(work.RESERVE,/reserved-bytes|INCRBY/);
});

test('guard keeps a request-scoped active ticket and does not consult v1 pause',async()=>{
 const calls=[];
 const command=async args=>{
  calls.push(args);
  if(args[0]==='EVAL'&&args[1]===guardModule.ENTER)return 1;
  if(args[0]==='EVAL'&&args[1]===guardModule.ADMIT)return [1,'admitted'];
  if(args[0]==='HDEL')return 1;
  throw Error('unexpected command '+args[0]);
 };
 const guard=guardModule.session(command,{clock:()=>Date.parse('2026-11-11T00:00:00Z')});
 await guard.withContext(async()=>{
  assert.equal(await guard.enter('ticket-1','{}'),1);
  assert.equal(guard.isPaused(),false);
  assert.ok((await guard.admit('/3/movie/157336',{language:'ja-JP'})).identity);
  assert.equal(guard.isPaused(),false);
  await guard.finish('ticket-1');
 });
 assert.equal(calls.length,3);
 assert.deepEqual(calls[2],['HDEL','doko:dev:cutover:v1:active','ticket-1']);
 assert.equal(calls[1][2],'3');
 assert.equal(calls[1][3],guardModule.KEY);
 assert.ok(calls.every(c=>!JSON.stringify(c).includes('acquisition-guard:v1')));
});

test('upstream refusal does not create permanent pause in request context',async()=>{
 const command=async args=>args[1]===guardModule.ENTER?1:args[1]===guardModule.ADMIT?[0,'upstream-limit']:1;
 const guard=guardModule.session(command);
 await guard.withContext(async()=>{
  assert.equal(await guard.enter('ticket-2','{}'),1);
  await assert.rejects(()=>guard.admit('/3/movie/1',{}),/upstream-limit/);
  assert.equal(guard.isPaused(),false);
  await guard.finish('ticket-2');
 });
});
