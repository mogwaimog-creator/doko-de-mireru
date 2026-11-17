'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {observeDispatch}=require('../api/_streaming-cron-entry-observer');
test('entry marker precedes release setup and has no secret values',async()=>{
 const events=[];
 await observeDispatch(async()=>{events.push(['handler']);return true},{log:(...args)=>events.push(args)});
 assert.equal(events[0][0],'STREAMING_CRON_STAGE');
 assert.equal(JSON.parse(events[0][1]).stage,'entry');
 assert.equal(events[1][0],'handler');
});
test('entry marker is emitted even when release setup fails',async()=>{
 const events=[];
 await assert.rejects(observeDispatch(async()=>{throw Error('private connection string')},{log:(...args)=>events.push(args)}));
 assert.equal(events[0][0],'STREAMING_CRON_STAGE');
 assert.equal(events[1][0],'STREAMING_CRON_DISPATCH_DIAGNOSTIC');
 assert.equal(JSON.stringify(events).includes('private connection string'),false);
});
