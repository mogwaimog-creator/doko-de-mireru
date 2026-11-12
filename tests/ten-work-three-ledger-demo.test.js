'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {store:workStore}=require('../prototype/work-ledger');
const {store:streamStore}=require('../prototype/streaming-ledger');
const {createSeoRecord}=require('../prototype/seo-ledger');
const {renderDetailHtml}=require('../prototype/seo-detail-renderer');
const template=fs.readFileSync(path.join(__dirname,'..','detail.html'),'utf8');
test('three ledgers render matching work-specific HTML and Japan streaming data for ten works',()=>{
 const works=workStore(),streams=streamStore();
 const fixtures=Array.from({length:10},(_,i)=>({
  type:i%2===0?'movie':'tv',id:1000+i,title:'検証作品'+(i+1),providerId:100+i
 }));
 for(const item of fixtures){
  assert.equal(works.register(item.type,item.id,{title:item.title,releaseDate:'2026-01-01',posterPath:'/test.jpg'}),true);
  works.confirm(item.type,item.id);
  assert.equal(streams.register(item.type,item.id),true);
  streams.success(item.type,item.id,{JP:{flatrate:[{provider_id:item.providerId,provider_name:'テスト配信'+item.providerId}],rent:[],buy:[]}},'2026-11-08T06:00:00Z');
 }
 const seen=new Set();
 for(const item of fixtures){
  const record=createSeoRecord(works.display(item.type,item.id),{updatedAt:'2026-11-08T06:00:00Z'});
  const html=renderDetailHtml(template,record);
  assert.ok(html.includes('<h1 id="title">'+item.title+'</h1>'));
  assert.ok(html.includes('href="'+record.canonical.replace(/&/g,'&amp;')+'"'));
  assert.equal(streams.watchOrder(item.type,item.id)[0].providerId,item.providerId);
  assert.equal(seen.has(record.key),false);
  seen.add(record.key);
 }
 assert.equal(works.audit().count,10);
 assert.equal(streams.audit().count,10);
 assert.equal(works.audit().duplicates,0);
 assert.equal(streams.audit().duplicates,0);
});
