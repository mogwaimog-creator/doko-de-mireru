'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scheduler}=require('../api/_ledger-scheduler-dev');
test('lean job failure is redacted and existing stopped behavior preserved',async()=>{
 const events=[],calls=[];
 const command=async args=>{calls.push(args[0]);if(args[0]==='GET')return JSON.stringify({status:'ready'});if(args[0]==='INCR')return 1;return 1};
 const job={run:async()=>{throw Object.assign(Error('rediss://PRIVATE'),{code:'ETIMEDOUT'})}};
 const result=await scheduler(command,job,{lean:true,clock:()=>Date.parse('2026-11-18T06:01:00+09:00'),diagnostic:x=>events.push(x)}).run([{type:'movie',id:1}]);
 assert.equal(result.status,'stopped');
 assert.equal(result.reason,'storage-or-journal-error');
 assert.equal(events[0].category,'ENTRY_FAILURE');
 assert.equal(events[0].code,'ETIMEDOUT');
 assert.equal(JSON.stringify(events).includes('PRIVATE'),false);
 assert.ok(calls.includes('EVAL'));
});
