'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {service}=require('../prototype/streaming-ledger-service');
function db(){const map=new Map(),locks=new Map();return {read:async k=>map.get(k)||null,acquire:async(k,t)=>{if(locks.has(k))return false;locks.set(k,t);return true},release:async(k,t)=>{if(locks.get(k)===t)locks.delete(k)},saveIfOwner:async(k,t,v)=>{if(locks.get(k)!==t)return false;map.set(k,v);return true}}}
const payload={results:{JP:{flatrate:[]}}};
const works=Array.from({length:7},(_,i)=>({type:'movie',id:i+1,memberships:[{kind:'watchOrder'}]}));
test('cron never exceeds configured concurrency',async()=>{
 let active=0,peak=0;
 const s=service(db(),async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,3));active--;return payload},{maxConcurrency:2});
 const result=await s.cron('2026-11-06T21:00:00Z',works);
 assert.equal(result.filter(x=>x.updated).length,7);assert.equal(peak,2);
});
test('timed-out TMDB request does not save empty or false success',async()=>{
 const database=db();let signal;
 const s=service(database,async(t,id,options)=>{signal=options.signal;return new Promise(()=>{})},{timeoutMs:5,ttlMs:100});
 const result=await s.visit('movie',9,'2026-11-07T00:00:00Z',[]);
 assert.equal(result.reason,'failed');assert.equal(signal.aborted,true);assert.equal(await database.read('movie:9'),null);
});
test('cron defers remaining works when time budget expires',async()=>{
 const s=service(db(),async()=>{await new Promise(r=>setTimeout(r,10));return payload},{maxConcurrency:1,cronBudgetMs:1});
 const result=await s.cron('2026-11-06T21:00:00Z',works);
 assert.equal(result.some(x=>x.reason==='deferred-budget'),true);
});
test('invalid limits are rejected',()=>{
 assert.throws(()=>service(db(),async()=>payload,{timeoutMs:100,ttlMs:50}),/invalid service limits/);
});
