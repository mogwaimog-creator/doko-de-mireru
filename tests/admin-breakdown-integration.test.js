'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
test('operator breakdown reads fixed roster and returns bounded counts',async()=>{
 const handlerPath=require.resolve('../api/admin-operations-breakdown');
 const connectionPath=require.resolve('../api/_release-connection');
 const rosterPath=require.resolve('../scripts/lib/cutover/package');
 const originalConnection=require.cache[connectionPath],originalRoster=require.cache[rosterPath];
 const fake=(filename,exports)=>{const mod=new Module(filename);mod.filename=filename;mod.loaded=true;mod.exports=exports;require.cache[filename]=mod};
 const previous=process.env.LEDGER_ADMIN_TOKEN;
 try{
  process.env.LEDGER_ADMIN_TOKEN='a'.repeat(40);
  fake(rosterPath,{roster:[{type:'movie',id:1},{type:'movie',id:2}]});
  fake(connectionPath,{connect:()=>({command:async args=>{
   assert.equal(args[0],'MGET');
   return args.slice(1).map(k=>k.includes('last-attempt')?JSON.stringify({status:'complete',succeeded:2}):k.includes('acquisition-guard')?JSON.stringify({daily:3,dailyScheduled:2}):k.includes('content-control')?JSON.stringify({status:'ready'}):k.includes('work:v2:movie:1')||k.includes('shared-stream:v1:record:movie:1')?'{}':null);
  }})});
  const res={setHeader(){return this},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};
  await require(handlerPath)({method:'GET',headers:{authorization:'Bearer '+'a'.repeat(40)}},res);
  assert.equal(res.statusCode,200);
  assert.equal(res.body.inventory.worksInRoster,2);
  assert.equal(res.body.inventory.storedWorks,1);
  assert.equal(res.body.inventory.storedStreaming,1);
  assert.equal(res.body.acquisition.scheduledStreamingAttempts,2);
 }finally{
  if(originalConnection)require.cache[connectionPath]=originalConnection;else delete require.cache[connectionPath];
  if(originalRoster)require.cache[rosterPath]=originalRoster;else delete require.cache[rosterPath];
  if(previous===undefined)delete process.env.LEDGER_ADMIN_TOKEN;else process.env.LEDGER_ADMIN_TOKEN=previous;
 }
});
