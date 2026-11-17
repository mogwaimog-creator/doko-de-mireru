'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {observeDispatch,recordPreflightFailure}=require('../api/_streaming-cron-entry-observer');
test('preserves dispatch result',async()=>{const value={ok:true};assert.equal(await observeDispatch(async()=>value,{log:()=>{}}),value)});
test('preflight marker has no secrets',()=>{const lines=[];recordPreflightFailure('update-streaming',Error('rediss://private'),{log:(...args)=>lines.push(args)});assert.equal(lines.length,1);assert.equal(JSON.stringify(lines).includes('private'),false)});
test('other routes do not emit cron preflight marker',()=>{let n=0;recordPreflightFailure('search',Error('failure'),{log:()=>n++});assert.equal(n,0)});
test('logger failure does not alter dispatch exception',async()=>{const error=Error('original');await assert.rejects(observeDispatch(async()=>{throw error},{log:()=>{throw Error('logging')}}),e=>e===error)});
