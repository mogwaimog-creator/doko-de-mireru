'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require.resolve('../api/admin-review-queue');
const original=Module._load;
Module._load=function(request,parent,isMain){
 if(parent?.filename===path&&request==='./_redis')return {command:async args=>{
   if(args[0]==='ZRANGE')return ['doko:work-review:v1:movie:1726'];
   if(args[0]==='MGET')return [JSON.stringify({type:'movie',id:1726,status:'unreviewed',registeredAt:'2026-10-31'})];
   if(args[0]==='ZCARD')return 1;
   throw Error('Unexpected command');
 }};
 if(parent?.filename===path&&request==='./_work-ledger')return {getWork:async()=>({title:'アイアンマン',releaseDate:'2008-04-30'})};
 return original.apply(this,arguments);
};
const handler=require('../api/admin-review-queue');
Module._load=original;
function res(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};}
test('private review queue refuses unauthorized requests and writes',async()=>{
 const old=process.env.ADMIN_STATUS_SECRET;
 process.env.ADMIN_STATUS_SECRET='test-secret';
 try{
   let r=res();await handler({method:'GET',headers:{}},r);assert.equal(r.code,401);
   r=res();await handler({method:'POST',headers:{authorization:'Bearer test-secret'}},r);assert.equal(r.code,405);
   r=res();await handler({method:'GET',headers:{authorization:'Bearer test-secret'},query:{offset:'-1'}},r);assert.equal(r.code,400);
 }finally{if(old===undefined)delete process.env.ADMIN_STATUS_SECRET;else process.env.ADMIN_STATUS_SECRET=old;}
});
test('private queue returns reviewable work details',async()=>{
 const old=process.env.ADMIN_STATUS_SECRET;process.env.ADMIN_STATUS_SECRET='test-secret';
 try{
 const r=res();await handler({method:'GET',headers:{authorization:'Bearer test-secret'},query:{}},r);
 assert.equal(r.code,200);assert.equal(r.body.totalIndexed,1);
 assert.deepEqual(r.body.items[0],{type:'movie',id:1726,title:'アイアンマン',releaseYear:'2008',status:'unreviewed',registeredAt:'2026-10-31',reviewedAt:null,reviewedBy:null});
 assert.equal(r.headers['Cache-Control'],'private, no-store');
 }finally{if(old===undefined)delete process.env.ADMIN_STATUS_SECRET;else process.env.ADMIN_STATUS_SECRET=old;}
});
