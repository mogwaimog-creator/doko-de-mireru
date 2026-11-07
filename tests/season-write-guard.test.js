'use strict';
const assert=require('node:assert/strict');
const {seasonWritesAllowed,assertSeasonWritesAllowed}=require('../api/_season-write-guard');
const {createSeasonRedisAdapter}=require('../api/_season-ledger-redis');
assert.equal(seasonWritesAllowed({}),false);
assert.equal(seasonWritesAllowed({LEDGER_WRITES_RESUME:'0'}),false);
assert.equal(seasonWritesAllowed({LEDGER_WRITES_RESUME:'true'}),false);
assert.equal(seasonWritesAllowed({LEDGER_WRITES_RESUME:'1'}),true);
assert.throws(()=>assertSeasonWritesAllowed({}),e=>e.code==='SEASON_LEDGER_WRITES_FROZEN');
const previous=process.env.LEDGER_WRITES_RESUME;
const record={type:'tv',id:123,seasonNumber:1,seasonName:'test',episodes:[]};
(async()=>{
 const commands=[];
 const adapter=createSeasonRedisAdapter(async args=>{commands.push(args);return 'OK';});
 try{
  delete process.env.LEDGER_WRITES_RESUME;
  await assert.rejects(adapter.putRecordIfAbsent(record),e=>e.code==='SEASON_LEDGER_WRITES_FROZEN');
  assert.equal(commands.length,0,'frozen state must issue no Redis commands');
  process.env.LEDGER_WRITES_RESUME='0';
  await assert.rejects(adapter.putRecordIfAbsent(record),e=>e.code==='SEASON_LEDGER_WRITES_FROZEN');
  assert.equal(commands.length,0);
  process.env.LEDGER_WRITES_RESUME='1';
  assert.equal(await adapter.putRecordIfAbsent(record),true);
  assert.equal(commands.length,1);
  assert.equal(commands[0][0],'SET');
  assert.equal(commands[0].at(-1),'NX');
 }finally{
  if(previous===undefined)delete process.env.LEDGER_WRITES_RESUME;
  else process.env.LEDGER_WRITES_RESUME=previous;
 }
 console.log('season ledger write freeze guard tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
