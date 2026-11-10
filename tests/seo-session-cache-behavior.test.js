'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'../scripts/seo-detail-session-cache.js'),'utf8');
test('repeat generated-detail request uses one network fetch within the same refresh slot',async()=>{
 const saved=new Map();
 let calls=0,now=Date.parse('2026-11-05T00:00:00+09:00');
 const context={Date:class extends Date{static now(){return now;}},sessionStorage:{
  getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)
 },fetch:async()=>{calls++;return new Response(JSON.stringify({fixed:{id:77},dynamic:{id:77,streaming:[],rental:[],purchase:[]}}),{status:200})},Response};
 vm.createContext(context);
 vm.runInContext(src,context);
 const url='/api/search?id=77&type=movie&detailFormat=split';
 await context.dokoCachedDetailFetch(url,{});
 await context.dokoCachedDetailFetch(url,{});
 assert.equal(calls,1);
 now+=6*60*1000;
 await context.dokoCachedDetailFetch(url,{});
 assert.equal(calls,2);
});
test('JST 06:00 and 18:00 boundaries invalidate cached responses',async()=>{
 const saved=new Map();let calls=0,now=Date.parse('2026-11-05T05:59:00+09:00');
 const context={Date:class extends Date{static now(){return now;}},sessionStorage:{getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},fetch:async()=>{calls++;return new Response(JSON.stringify({fixed:{id:77},dynamic:{id:77}}),{status:200})},Response};
 vm.createContext(context);vm.runInContext(src,context);
 const url='/api/search?id=77&type=movie&detailFormat=split';
 await context.dokoCachedDetailFetch(url,{});
 now+=2*60*1000;await context.dokoCachedDetailFetch(url,{});
 assert.equal(calls,2);
 now=Date.parse('2026-11-05T17:59:00+09:00');
 await context.dokoCachedDetailFetch(url,{});
 now+=2*60*1000;await context.dokoCachedDetailFetch(url,{});
 assert.equal(calls,4);
});
