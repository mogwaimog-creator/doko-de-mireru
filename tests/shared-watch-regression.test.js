'use strict';
// Run: node --test tests/shared-watch-regression.test.js
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const endpoint=path.resolve(__dirname,'../api/series-watch.js');
const works=require('../data/streaming-works.json');
const keyset=new Set(works.map(w=>w.type+':'+w.id));
const ids=[21731,45500,196400,21732];
test('all verified Gundam works are in the scheduled registry',()=>{
 for(const id of ids)assert.ok(keyset.has('tv:'+id),'missing tv:'+id);
});
test('registry contains no duplicate (type,id) pairs',()=>{
 assert.equal(keyset.size,works.length);
});
test('all Godzilla works are present in the canonical registry',()=>{
 const godzilla=require('../data/godzilla-works.json');
 assert.equal(godzilla.length,47);
 for(const work of godzilla)assert.ok(keyset.has(work.type+':'+work.id),'missing '+work.type+':'+work.id);
});
async function call(query,records,method='GET'){
 const original=Module._load;
 let calls=0;
 Module._load=function(request,parent,isMain){
  if(request==='./_redis'&&parent?.filename===endpoint)return {command:async args=>{
   calls++;
   assert.equal(args[0],'MGET');
   return args.slice(1).map(key=>records[key]??null);
  }};
  return original.apply(this,arguments);
 };
 try{
  delete require.cache[endpoint];
  const handler=require(endpoint);
  const response={statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(code){this.statusCode=code;return this},json(data){this.body=data;return this}};
  await handler({method,query:{series:query}},response);
  return {response,calls};
 }finally{
  Module._load=original;
  delete require.cache[endpoint];
 }
}
test('Gundam endpoint serves verified works from Redis only',async()=>{
 const now=new Date().toISOString();
 const records=Object.fromEntries(ids.map(id=>['doko:watch:v3:tv:'+id,JSON.stringify({flatrate:[{provider_id:8,provider_name:'Netflix',logo_path:'/logo.jpg'}],checkedAt:now})]));
 const {response,calls}=await call('gundam',records);
 assert.equal(response.statusCode,200);
 assert.equal(calls,1);
 assert.equal(Object.keys(response.body.providers).length,4);
 assert.equal(response.body.failures.length,0);
 assert.equal(response.body.providers['tv:21731'].stale,false);
});
test('stale cached data is returned with a stale flag',async()=>{
 const old=new Date(Date.now()-48*3600000).toISOString();
 const {response}=await call('gundam',{'doko:watch:v3:tv:21731':JSON.stringify({flatrate:[],checkedAt:old})});
 assert.equal(response.body.providers['tv:21731'].stale,true);
 assert.equal(response.body.failures.length,3);
});
test('invalid series is rejected without Redis access',async()=>{
 const {response,calls}=await call('unknown',{});
 assert.equal(response.statusCode,400);
 assert.equal(calls,0);
});
test('non-GET requests are rejected',async()=>{
 const {response,calls}=await call('gundam',{},'POST');
 assert.equal(response.statusCode,405);
 assert.equal(calls,0);
});

const {windowJST}=require('../api/update-streaming.js')._test;
test('JST 06:00 and 18:00 are distinct update windows',()=>{
 const utc=(v)=>Date.parse(v);
 assert.equal(windowJST(utc('2026-11-01T20:59:59Z')),'2026-11-01-18');
 assert.equal(windowJST(utc('2026-11-01T21:00:00Z')),'2026-11-02-06');
 assert.equal(windowJST(utc('2026-11-02T08:59:59Z')),'2026-11-02-06');
 assert.equal(windowJST(utc('2026-11-02T09:00:00Z')),'2026-11-02-18');
});
test('stale cache is not silently treated as fresh',async()=>{
 const future=new Date(Date.now()+120000).toISOString();
 const {response}=await call('gundam',{'doko:watch:v3:tv:21731':JSON.stringify({flatrate:[],checkedAt:future})});
 assert.equal(response.body.providers['tv:21731'].stale,true);
});
test('malformed cached JSON is isolated as a missing record',async()=>{
 const {response}=await call('gundam',{'doko:watch:v3:tv:21731':'{broken'});
 assert.equal(response.statusCode,200);
 assert.equal(response.body.failures.includes('tv:21731'),true);
});

test('all series endpoints read only canonical registered keys',async()=>{
 for(const series of ['godzilla','mcu','jurassic','harrypotter','lordoftherings','starwars','wildspeed','minions','odoru','eva','conan','gundam']){
  const {response,calls}=await call(series,{});
  assert.equal(response.statusCode,200,series);
  assert.equal(calls,1,series);
  assert.ok(Array.isArray(response.body.failures),series);
 }
});

const fs=require('node:fs');
test('all twelve viewing-order pages use the shared watch endpoint and handle stale records',()=>{
 const series=['godzilla','mcu','jurassic','harrypotter','lordoftherings','starwars','wildspeed','minions','odoru','eva','conan','gundam'];
 for(const name of series){
  const html=fs.readFileSync(path.resolve(__dirname,'../'+name+'.html'),'utf8');
  assert.ok(html.includes('/api/series-watch?series='+name),name+' missing shared watch endpoint');
  assert.ok(html.includes('.stale'),name+' missing stale snapshot handling');
 }
});
test('completed viewing-order pages do not request the legacy search API',()=>{
 const complete=['godzilla','mcu','jurassic','harrypotter','lordoftherings','wildspeed','minions','odoru','eva','conan'];
 for(const name of complete){
  const html=fs.readFileSync(path.resolve(__dirname,'../'+name+'.html'),'utf8');
  assert.ok(!html.includes('/api/search'),name+' still references legacy search API');
 }
});
test('Gundam season-specific titles are not registered as standalone parent-show streaming data',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../gundam.html'),'utf8');
 assert.ok(html.includes('gundamSeasonWorks'));
 assert.ok(html.includes('親番組の情報を流用していません'));
});
