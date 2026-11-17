'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {run}=require('../scripts/aiven-isolated-streaming-probe');
const env={REDIS_PROVIDER:'valkey',AIVEN_REDIS_URL:'rediss://user:secret@example.aivencloud.com:12345',TMDB_API_KEY:'fixture',AIVEN_ISOLATED_PROBE_CONFIRM:'YES'};
test('probe is opt-in and cannot fetch without explicit confirmation',async()=>{
 let fetched=0;
 await assert.rejects(run({env:{...env,AIVEN_ISOLATED_PROBE_CONFIRM:'NO'},fetchImpl:async()=>{fetched++;}}),/confirmation/);
 assert.equal(fetched,0);
});
test('one TMDB fetch is saved only to unique expiring Aiven probe key and read back',async()=>{
 const calls=[],saved=new Map(),events=[];
 const createClient=()=>({isOpen:false,on(){return this},async connect(){this.isOpen=true},async sendCommand(args){
  calls.push(args);
  if(args[0]==='SET'){assert.match(args[1],/^doko:ledger:probe:aiven-v2:stream:[0-9a-f-]{36}$/);assert.deepEqual(args.slice(3),['NX','EX','120']);assert.equal(saved.has(args[1]),false);saved.set(args[1],args[2]);return 'OK'}
  if(args[0]==='GET')return saved.get(args[1])??null;
  throw Error('unexpected command');
 },destroy(){this.isOpen=false}});
 let fetched=0;
 const result=await run({env,createClient,fetchImpl:async(url)=>{fetched++;assert.equal(url.pathname,'/3/movie/157336/watch/providers');assert.equal(url.searchParams.get('api_key'),'fixture');assert.equal(url.searchParams.get('language'),'ja-JP');return {ok:true,json:async()=>({results:{JP:{flatrate:[{provider_id:9}]}}})}},emit:(...args)=>events.push(args.join(' '))});
 assert.equal(result.ok,true);assert.equal(result.readback,true);assert.equal(fetched,1);
 assert.deepEqual(calls.map(args=>args[0]),['SET','GET']);
 assert.ok(events.some(s=>s.includes('"saved":true')&&s.includes('"readback":true')));
});
test('failed save never claims success or attempts readback',async()=>{
 const calls=[],createClient=()=>({isOpen:false,on(){return this},async connect(){this.isOpen=true},async sendCommand(args){calls.push(args);throw Error('write failed')},destroy(){this.isOpen=false}});
 await assert.rejects(run({env,createClient,fetchImpl:async()=>({ok:true,json:async()=>({results:{}})}),emit:()=>{}}),/outcome may be unknown/);
 assert.deepEqual(calls.map(args=>args[0]),['SET']);
});
