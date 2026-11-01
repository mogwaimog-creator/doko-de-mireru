'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
const path=require.resolve('../api/admin-confirm-review'),original=Module._load;
const work={type:'movie',id:1726,title:'アイアンマン',releaseDate:'2008-04-30',posterPath:'/p.jpg'};
const crypto=require('node:crypto');
const hash=crypto.createHash('sha256').update(JSON.stringify({type:'movie',id:1726,title:work.title,releaseDate:work.releaseDate,posterPath:work.posterPath})).digest('hex');
let called=0;
Module._load=function(request,parent,isMain){
 if(parent?.filename===path&&request==='./_work-ledger')return {getWork:async()=>work,identity:(type,id)=>{if(type!=='movie'||Number(id)!==1726)throw Error('invalid');}};
 if(parent?.filename===path&&request==='./_work-review')return {fingerprint:()=>hash,markReviewed:async()=>{called++;return {type:'movie',id:1726,status:'reviewed',reviewedAt:'2026-10-31'};}};
 return original.apply(this,arguments);
};
const handler=require('../api/admin-confirm-review');Module._load=original;
function res(){return {setHeader(){},status(n){this.code=n;return this;},json(b){this.body=b;return this;}};}
test('confirmation rejects unauthorized, wrong method, invalid and stale fingerprints',async()=>{
 const prev=process.env.ADMIN_STATUS_SECRET;process.env.ADMIN_STATUS_SECRET='secret';
 try{
 let r=res();await handler({method:'POST',headers:{},body:{}},r);assert.equal(r.code,401);
 r=res();await handler({method:'GET',headers:{authorization:'Bearer secret'}},r);assert.equal(r.code,405);
 r=res();await handler({method:'POST',headers:{authorization:'Bearer secret'},body:{type:'movie',id:1726,expectedFingerprint:'bad'}},r);assert.equal(r.code,400);
 r=res();await handler({method:'POST',headers:{authorization:'Bearer secret'},body:{type:'movie',id:1726,expectedFingerprint:'a'.repeat(64)}},r);assert.equal(r.code,409);
 assert.equal(called,0);
 r=res();await handler({method:'POST',headers:{authorization:'Bearer secret'},body:{type:'movie',id:1726,expectedFingerprint:hash}},r);
 assert.equal(r.code,200);assert.equal(called,1);
 }finally{if(prev===undefined)delete process.env.ADMIN_STATUS_SECRET;else process.env.ADMIN_STATUS_SECRET=prev;}
});
