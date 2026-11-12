'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createFrozenLoader}=require('../api/_frozen-load');
function load(name,values=new Map()){
 const calls=[],env={WORK_LEDGER_ENABLED:'1',LEDGER_WRITES_RESUME:'0'},module={exports:{}};
 const command=async args=>{calls.push(args);assert.equal(args[0],'GET','freeze must not write or lock Redis');return values.get(args[1])??null};
 const deps={'./_redis':{command},'./_work-ledger':{identity:(type,id)=>({type,id:Number(id)}),getWork:async()=>null,putWorkIfAbsent:async()=>{throw Error('unexpected persistence')}}};
 const filename=path.join(__dirname,'../api',name);
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{module,process:{env},console,Date,Buffer,setTimeout,clearTimeout,require:n=>deps[n]||require(require('node:module').createRequire(filename).resolve(n))});
 return {...module.exports,calls,env};
}
test('frozen metadata coalesces concurrent and immediate sequential reads, validates ID and avoids Redis mutations',async()=>{
 const api=load('_detail-metadata-cache.js');let loads=0;
 const request=()=>api.metadataWithLedger('movie',635302,async()=>{loads++;await new Promise(r=>setTimeout(r,5));return {id:635302,title:'無限列車編','watch/providers':{results:{JP:{}}}}});
 const all=await Promise.all(Array.from({length:20},request));await request();assert.equal(loads,1);assert(!Object.hasOwn(all[0],'watch/providers'));
 all[0].title='mutated';assert.equal((await request()).title,'無限列車編');
 await assert.rejects(api.metadataWithLedger('tv',85937,async()=>({id:635302,title:'wrong'})),/Invalid work/);
 await assert.rejects(api.metadataWithLedger('tv',85938,async()=>({id:85938,media_type:'movie'})),/Invalid work/);
});
test('frozen person coalesces and rejects mismatched IDs without writing',async()=>{
 const api=load('_person-ledger.js');let loads=0;
 const request=()=>api.withPersonLedger(1813,async()=>{loads++;return {id:1813,name:'fixture',cast:[]}});
 await Promise.all([request(),request()]);await request();assert.equal(loads,1);
 await assert.rejects(api.withPersonLedger(500,async()=>({id:1813,name:'wrong'})),/Invalid person/);
 assert(api.calls.every(x=>x[0]==='GET'));
});
test('frozen providers coalesce without claiming persistence or taking Redis locks',async()=>{
 const api=load('_detail-providers-cache.js');let loads=0;
 const request=()=>api.getDetailProviders('movie',635302,async()=>{loads++;return {results:{JP:{flatrate:[]},US:{flatrate:[{}]}}}});
 const [a]=await Promise.all([request(),request()]);await request();assert.equal(loads,1);assert.equal(a.persisted,false);assert.deepEqual(Object.keys(a.data.results),['JP']);
});
test('bounded frozen cache expires, caps memory, and suppresses repeated failures',async()=>{
 let now=0,calls=0;const cache=createFrozenLoader({now:()=>now,ttlMs:30,maxEntries:2,maxBytes:100,maxRecordBytes:80});
 const load=async()=>{calls++;return {value:'ok'}};await cache.run('a',load);await cache.run('a',load);assert.equal(calls,1);
 now=31;await cache.run('a',load);assert.equal(calls,2);await cache.run('b',load);await cache.run('c',load);assert(cache.stats().entries<=2);assert(cache.stats().bytes<=100);
 let fails=0;const fail=()=>cache.run('bad',async()=>{fails++;throw Error('upstream invalid')});await assert.rejects(fail());await assert.rejects(fail());assert.equal(fails,1);
 now+=31;await assert.rejects(fail());assert.equal(fails,2);
});
test('hung frozen lookup times out and caches a bounded failure instead of occupying a slot forever',async()=>{
 const cache=createFrozenLoader({timeoutMs:5,ttlMs:30,maxBytes:100});let loads=0;
 const request=()=>cache.run('hung',()=>{loads++;return new Promise(()=>{})});
 await assert.rejects(request(),e=>e.code==='FROZEN_LOOKUP_TIMEOUT');await assert.rejects(request(),e=>e.code==='FROZEN_LOOKUP_TIMEOUT');assert.equal(loads,1);assert(cache.stats().bytes<=100);
});

test('ID validation remains active with legacy ledger flags off and preserves valid object identity',async()=>{
 const metadata=load('_detail-metadata-cache.js');metadata.env.WORK_LEDGER_ENABLED='0';const original={id:635302,title:'valid'};
 assert.equal(await metadata.metadataWithLedger('movie',635302,async()=>original),original);await assert.rejects(metadata.metadataWithLedger('tv',85937,async()=>original),/Invalid work/);assert.equal(metadata.calls.length,0);
 const person=load('_person-ledger.js');person.env.WORK_LEDGER_ENABLED='0';await assert.rejects(person.withPersonLedger(1813,async()=>({id:500})),/Invalid person/);assert.equal(person.calls.length,0);
});

test('freeze preserves stale saved provider/person successes without refreshing or writing',async()=>{
 const values=new Map([['doko:detail-providers:v1:movie:635302',JSON.stringify({data:{results:{JP:{flatrate:[{provider_id:8}]}}},checkedAt:'2020-01-01T00:00:00Z'})],['doko:person:v1:1813',JSON.stringify({schemaVersion:1,person:{id:1813,name:'saved'},checkedAt:'2020-01-01T00:00:00Z'})]]);
 const provider=load('_detail-providers-cache.js',values);const before=JSON.stringify([...values]);
 const result=await provider.getDetailProviders('movie',635302,async()=>{throw Error('must not fetch')});assert.equal(result.stale,true);assert.equal(result.data.results.JP.flatrate[0].provider_id,8);
 const person=load('_person-ledger.js',values);assert.equal((await person.withPersonLedger(1813,async()=>{throw Error('must not fetch')})).name,'saved');assert.equal(JSON.stringify([...values]),before);
});
