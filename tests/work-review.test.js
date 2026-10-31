'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const redis=require('../api/_redis');
const original=redis.command;
const store=new Map();
redis.command=async args=>{
 const [op,k,v,...rest]=args;
 if(op==='GET')return store.get(k)||null;
 if(op==='SET'){if(rest[0]==='NX'&&store.has(k))return null;store.set(k,v);return 'OK';}
 if(op==='ZADD')return 1;
 if(op==='EVAL'){const isAudit=args[2]==='2';const key=args[3],old=args[isAudit?5:4],next=args[isAudit?6:5];if(store.get(key)!==old)return 0;store.set(key,next);return 1;}
 throw Error('Unexpected Redis command '+op);
};
const {registerForReview,getReview,markReviewed}=require('../api/_work-review');
const base={type:'movie',id:1726,title:'アイアンマン',releaseDate:'2008-04-30',posterPath:'/p.jpg'};
test('new work is unreviewed and duplicate registration preserves review',async()=>{
 const first=await registerForReview(base,'mcu');
 assert.equal(first.created,true);
 assert.equal(first.status,'unreviewed');
 const reviewed=await markReviewed(base,'admin');
 assert.equal(reviewed.status,'reviewed');
 const second=await registerForReview(base,'shelf');
 assert.equal(second.created,false);
 assert.equal(second.status,'reviewed');
});
test('changed metadata needs recheck without touching other state',async()=>{
 const changed={...base,releaseDate:'2008-05-01'};
 const record=await registerForReview(changed,'mcu');
 assert.equal(record.status,'needs_recheck');
 assert.equal(record.reviewedAt,null);
 await assert.rejects(()=>markReviewed(base,'admin'),/Metadata changed/);
 assert.equal((await getReview('movie',1726)).status,'needs_recheck');
});
test.after(()=>{redis.command=original;});
