'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const redis=require('../api/_redis');
const store=new Map(), index=new Map();
const original=redis.command;
redis.command=async ([op,...args])=>{
  if(op==='GET')return store.get(args[0])||null;
  if(op==='SET'){store.set(args[0],args[1]);return 'OK';}
  if(op==='ZADD'){index.set(args[2],Number(args[1]));return 1;}
  if(op==='ZREVRANGE')return [...index].sort((a,b)=>b[1]-a[1]).slice(Number(args[1]),Number(args[2])+1).map(x=>x[0]);
  if(op==='DEL'){store.delete(args[0]);return 1;}
  if(op==='ZREM'){index.delete(args[1]);return 1;}
  throw Error(op);
};
const issues=require('../api/_work-issues');
test('deduplicates repeated 404 and lists for review',async()=>{
 const a=await issues.recordIssue('movie',123,'metadata',{status:404},'2026-10-30T00:00:00Z');
 const b=await issues.recordIssue('movie',123,'metadata',{status:404},'2026-10-31T00:00:00Z');
 assert.equal(a.count,1);assert.equal(b.count,2);assert.equal(b.firstSeenAt,a.firstSeenAt);
 assert.equal((await issues.listIssues())[0].reviewRequired,true);
});
test('rate limits do not require ID review',async()=>{
 const r=await issues.recordIssue('tv',456,'providers',{status:429});
 assert.equal(r.kind,'rate_limit');assert.equal(r.reviewRequired,false);
 await issues.clearIssue('tv',456,'providers');
 assert.equal((await issues.listIssues()).some(x=>x.id===456),false);
});
test('invalid area is rejected',async()=>{
 await assert.rejects(()=>issues.recordIssue('movie',1,'invalid',{}),/Invalid issue area/);
});
test.after(()=>{redis.command=original;});
