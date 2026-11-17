'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const { _test:{handler,diagnose} }=require('../api/cron-diagnostic');
const env={REDIS_PROVIDER:'valkey',AIVEN_REDIS_URL:'rediss://placeholder',CRON_SECRET:'test-secret'};
function response(){return {headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
test('manual diagnostic is authenticated and does not access Redis when unauthorized',async()=>{
 let called=false;const res=response();
 await handler({method:'GET',headers:{}},res,{env,command:async()=>{called=true}});
 assert.equal(res.statusCode,401);assert.equal(called,false);
});
test('manual diagnostic makes only one bounded MGET and never writes',async()=>{
 const calls=[],res=response(),now=()=>Date.parse('2026-11-18T08:00:00+09:00');
 await handler({method:'GET',headers:{authorization:'Bearer test-secret'}},res,{env,now,command:async args=>{calls.push(args);return [JSON.stringify({status:'ready'}),JSON.stringify({day:'2026-11-17',status:'stopped'}),JSON.stringify({day:'2026-11-14',status:'complete'})]}});
 assert.equal(res.statusCode,200);assert.equal(res.body.updatedToday,false);assert.equal(res.body.lastAttempt.status,'stopped');assert.equal(calls.length,1);assert.equal(calls[0][0],'MGET');assert.equal(calls[0].length,4);
});
test('Aiven command errors return sanitized 503',async()=>{
 const res=response();
 await handler({method:'GET',headers:{authorization:'Bearer test-secret'}},res,{env,command:async()=>{throw Error('rediss://secret@host')}});
 assert.equal(res.statusCode,503);assert.equal(JSON.stringify(res.body).includes('secret@host'),false);
});
