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
