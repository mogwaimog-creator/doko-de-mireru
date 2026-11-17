'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {wrapScheduler,diagnosticLine}=require('../api/_streaming-cron-observer');
const {classify,safeError}=require('../api/_streaming-cron-observer-core');
test('preserves scheduler result and arguments',async()=>{
 const calls=[],roster=[{type:'movie',id:1}],options={signal:null},result={status:'complete'};
 const observed=wrapScheduler({run:async(...args)=>{calls.push(args);return result}},{clock:()=>1000,log:()=>{}});
 assert.equal(await observed.run(roster,options),result);assert.deepEqual(calls,[[roster,options]]);
});
test('emits two safe events without extra storage calls',async()=>{
 const lines=[],observed=wrapScheduler({run:async()=>({status:'complete',succeeded:1})},{clock:()=>1000,log:(...args)=>lines.push(args)});
 await observed.run([]);assert.equal(lines.length,2);assert.equal(JSON.parse(lines[1][1]).code,'COMPLETE');
});
test('preserves errors and redacts messages',async()=>{
 const lines=[],observed=wrapScheduler({run:async()=>{throw Object.assign(Error('rediss://secret'),{code:'STORAGE_FAILURE'})}},{clock:()=>1000,log:(...args)=>lines.push(args)});
 await assert.rejects(observed.run([]),/rediss/);assert.equal(JSON.stringify(lines).includes('secret'),false);
});
test('log failure cannot change cron result',async()=>{
 const result={status:'stopped'};assert.equal(await wrapScheduler({run:async()=>result},{clock:()=>1000,log:()=>{throw Error('log')}}).run([]),result);
});
test('classifies pause, lease and unknown status',()=>{
 assert.equal(classify({status:'stopped',reason:'shared-pause'}),'CONTROL_PAUSED');
 assert.equal(classify({status:'busy',reason:'work-busy'}),'WORK_LEASE_BUSY');
 assert.equal(classify({status:'unexpected'}),'UNEXPECTED_RESULT');
});
test('rejects unsafe error codes and unknown diagnostic fields',()=>{
 assert.equal(safeError({code:'secret://value'}),'UNKNOWN');
 assert.equal(diagnosticLine({event:'started',password:'hidden'}),'{"event":"started"}');
});
