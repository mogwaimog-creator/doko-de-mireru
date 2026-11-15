'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {source}=require('../api/_release-source');
const {session}=require('../api/_acquisition-guard');
const {ReadableStream}=require('node:stream/web');
const now=Date.parse('2026-11-11T00:00:00Z');
function response(data){const bytes=new TextEncoder().encode(JSON.stringify(data));return {ok:true,body:new ReadableStream({start(c){c.enqueue(bytes);c.close()}})}}
test('search, detail, person, providers share bounded guard admission',async()=>{
 const calls=[],commands=[];
 const guard=session(async args=>{commands.push(args);if(args[1]===require('../api/_acquisition-guard').ENTER)return 1;if(args[1]===require('../api/_acquisition-guard').ADMIT)return [1,'admitted'];if(args[0]==='HDEL')return 1;throw Error('unexpected command')},{clock:()=>now});
 const mock=async url=>{calls.push(url.pathname);if(url.pathname.includes('watch/providers'))return response({id:157336,results:{JP:{flatrate:[]}}});if(url.pathname==='/3/search/movie')return response({results:[{id:157336}]});if(url.pathname==='/3/person/1813')return response({id:1813,name:'Test'});if(url.pathname==='/3/movie/157336')return response({id:157336,title:'Test'});throw Error('unexpected path '+url.pathname)};
 const load=source({command:async()=>{throw Error('unexpected fallback')},apiKey:'test',dailyLimit:300,request:mock,clock:()=>now,guard});
 await guard.withContext(async()=>{await guard.enter('token',JSON.stringify({startedAt:now}));try{
  assert.equal((await load('/3/search/movie',{query:'test'})).results[0].id,157336);
  assert.equal((await load('/3/movie/157336')).id,157336);
  assert.equal((await load('/3/person/1813')).id,1813);
  assert.ok((await load('/3/movie/157336/watch/providers')).results.JP);
 }finally{await guard.finish('token')}});
 assert.equal(calls.length,4);
 assert.equal(commands.filter(x=>x[1]===require('../api/_acquisition-guard').ADMIT).length,4);
});
test('upstream failure is recorded without a permanent pause',async()=>{
 const commands=[],guard=session(async args=>{commands.push(args);if(args[1]===require('../api/_acquisition-guard').ENTER)return 1;if(args[1]===require('../api/_acquisition-guard').ADMIT)return [1,'admitted'];if(args[1]===require('../api/_acquisition-guard').FAILURE)return 0;if(args[0]==='HDEL')return 1;throw Error('unexpected')},{clock:()=>now});
 const load=source({command:async()=>{},apiKey:'test',dailyLimit:300,request:async()=>({ok:false,status:503}),clock:()=>now,guard});
 await guard.withContext(async()=>{await guard.enter('token',JSON.stringify({startedAt:now}));try{await assert.rejects(()=>load('/3/movie/157336'),/metadata unavailable/);assert.equal(guard.isPaused(),false)}finally{await guard.finish('token')}});
 assert.ok(commands.some(x=>x[1]===require('../api/_acquisition-guard').FAILURE));
});

test('ordinary upstream allows past former cap but stops at 3000 daily; minute and scheduled limits remain', {skip:!process.env.REDIS_TEST_CLI}, async()=>{
 const {command}=require('./helpers/local-redis');
 const guardModule=require('../api/_acquisition-guard');
 const now=Date.parse('2026-11-15T01:00:00Z'),minute=Math.floor(now/60000),day=new Date(now+9*3600000).toISOString().slice(0,10);
 await command(['SET',guardModule.CONTROL||'doko:dev:content-control:v1',JSON.stringify({status:'ready'})]);
 const baseline={version:2,minute,requests:0,acquisitions:0,scheduled:0,failures:0,day,daily:1200,dailyScheduled:0};
 await command(['SET',guardModule.KEY,JSON.stringify(baseline)]);
 const guard=guardModule.session(command,{clock:()=>now});
 await guard.withContext(async()=>{
  assert.equal(await guard.enter('restore-limit-test',JSON.stringify({startedAt:now})),1);
  try{
   await guard.admit('/3/movie/157336',{}, {dailyLimit:1200});
   let state=await guard.status();
   assert.equal(state.daily,1201);
   await command(['SET',guardModule.KEY,JSON.stringify({...state,daily:2999,acquisitions:0})]);
   await guard.admit('/3/movie/157336',{}, {dailyLimit:1200});
   state=await guard.status();
   assert.equal(state.daily,3000);
   await assert.rejects(guard.admit('/3/movie/157337',{}, {dailyLimit:1200}),e=>e.code==='ACQUISITION_STOPPED'&&/upstream-limit/.test(e.message));
   await command(['SET',guardModule.KEY,JSON.stringify({...state,acquisitions:30})]);
   await assert.rejects(guard.admit('/3/movie/157337',{}, {dailyLimit:1200}),e=>e.code==='ACQUISITION_STOPPED');
   await command(['SET',guardModule.KEY,JSON.stringify({...baseline,dailyScheduled:266})]);
   await assert.rejects(guard.admit('/3/movie/157336/watch/providers',{}, {scheduled:true,dailyLimit:1200}),e=>e.code==='ACQUISITION_STOPPED');
  }finally{await guard.finish('restore-limit-test')}
 });
});
