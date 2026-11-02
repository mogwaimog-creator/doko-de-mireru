'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const redisPath=require.resolve('../api/_redis');
const ledgerPath=require.resolve('../api/_work-ledger');
const anomaliesPath=require.resolve('../api/_work-anomalies');
const reviewPath=require.resolve('../api/_work-review');
const original=new Map([redisPath,ledgerPath,anomaliesPath,reviewPath].map(p=>[p,require.cache[p]]));
const data=new Map();
require.cache[redisPath]={id:redisPath,filename:redisPath,loaded:true,exports:{command:async args=>{
 const [cmd,key,value,a,b]=args;
 if(cmd==='GET')return data.get(key)||null;
 if(cmd==='SET'){
  if((a==='NX'||b==='NX')&&data.has(key))return null;
  data.set(key,value);return 'OK';
 }
 if(cmd==='EVAL'){const listKey=a;const event=b;const limit=Number(args[5]);const items=data.get(listKey)||[];items.unshift(event);data.set(listKey,items.slice(0,limit));return 1;}
 if(cmd==='LRANGE')return (data.get(key)||[]).slice(Number(value),Number(a)+1);
 if(cmd==='DEL')return data.delete(key)?1:0;
 throw Error('Unexpected Redis command '+cmd);
}}};
for(const p of [ledgerPath,anomaliesPath,reviewPath])delete require.cache[p];
const {putWorkIfAbsent,getWork}=require('../api/_work-ledger');
const {inspectExistingWork}=require('../api/_work-review');
const {listAnomalies}=require('../api/_work-anomalies');
test.after(()=>{for(const [p,entry] of original){if(entry)require.cache[p]=entry;else delete require.cache[p];}});
test('review keeps original work and saves previous and observed values',async()=>{
 data.clear();
 await putWorkIfAbsent('movie',101,{title:'作品A',posterPath:'/old.jpg'});
 const result=await inspectExistingWork('movie',101,{id:101,title:'別の作品',poster_path:'/new.jpg'}, {page:'detail',source:'manual_review'});
 assert.equal(result.status,'needs_review');
 assert.equal((await getWork('movie',101)).title,'作品A');
 const events=await listAnomalies('movie',101);
 assert.equal(events.length,1);
 assert.equal(events[0].status,'pending_review');
 assert.ok(events[0].changes.some(c=>c.field==='title'&&c.previous==='"作品A"'&&c.observed==='"別の作品"'));
 const again=await inspectExistingWork('movie',101,{id:101,title:'別の作品',poster_path:'/new.jpg'});
 assert.equal(again.duplicate,true);
 assert.equal((await listAnomalies('movie',101)).length,1);
});
test('reject mismatched TMDB identity before logging',async()=>{
 await assert.rejects(inspectExistingWork('movie',101,{id:999,title:'wrong'}),/ID mismatch/);
});
