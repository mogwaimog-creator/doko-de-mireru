'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createHandler}=require('../api/detail-page');
const {createSeoRecord}=require('../prototype/seo-ledger');
const {keys}=require('../api/_dev-content-ledgers');
const {sharedStore}=require('../api/_shared-streaming-store');
const template=fs.readFileSync(path.join(__dirname,'../detail.html'),'utf8');
function response(){
 const headers={};
 return {headers,statusCode:200,body:'',setHeader(k,v){headers[k]=v;return this},status(n){this.statusCode=n;return this},end(s){this.body=s;return this}};
}
for(const [type,id,title] of [['movie',1726,'アイアンマン'],['tv',1399,'ゲーム・オブ・スローンズ']]){
 test('detail HTML reads saved work and streaming without network: '+type,async()=>{
  const work={schemaVersion:2,type,id,title,overview:'作品固有のあらすじ',releaseDate:type==='movie'?'2008-04-30':'2011-04-17',genres:['ドラマ']};
  const stream={schemaVersion:1,type,id,lastSuccessAt:'2026-11-10T01:00:00.000Z',japan:{flatrate:[{name:'U-NEXT',providerId:1}],rent:[],buy:[]}};
  const streamKey=sharedStore(async()=>null).keys.dataKey(type+':'+id);
  const calls=[];
  const command=async args=>{calls.push(args);if(args[0]!=='GET')throw Error('unexpected Redis command');if(args[1]===keys.work(type,id))return JSON.stringify(work);if(args[1]===streamKey)return JSON.stringify(stream);throw Error('unexpected Redis key')};
  const handler=createHandler({active:()=>true,template:()=>template,cacheCommand:command,
   project:async()=>createSeoRecord({type,id,...work}),readFixed:async()=>{throw Error('unexpected metadata fallback')},
   fetchMetadata:async()=>{throw Error('unexpected TMDB fetch')}});
  const res=response();
  await handler({method:'GET',query:{type,id:String(id)}},res);
  assert.equal(res.statusCode,200);
  assert.match(res.body,new RegExp('<h1 id="title">'+title+'</h1>'));
  assert.match(res.body,/作品固有のあらすじ/);
  assert.match(res.body,/公開年：(2008|2011)年/);
  assert.match(res.body,/id="serverProviders"/);
  assert.match(res.body,/U-NEXT/);
  assert.equal(calls.length,2);
 });
}
test('streaming Redis outage does not make saved work HTML fail',async()=>{
 const type='movie',id=1726;
 const command=async args=>{if(args[1]===keys.work(type,id))return JSON.stringify({schemaVersion:2,type,id,title:'アイアンマン',overview:'作品紹介'});throw Error('Redis streaming unavailable')};
 const handler=createHandler({active:()=>true,template:()=>template,cacheCommand:command,
  project:async()=>createSeoRecord({type,id,title:'アイアンマン'}),readFixed:async()=>{throw Error('metadata fallback forbidden')}});
 const res=response();await handler({method:'GET',query:{type,id:String(id)}},res);
 assert.equal(res.statusCode,200);
 assert.match(res.body,/アイアンマン/);
});
