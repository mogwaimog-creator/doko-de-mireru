'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/cron-manual');
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(v){this.body=v;return this}}}
test('manual cron rejects unauthenticated requests',async()=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-secret';
 try{const res=response();await handler({method:'GET',headers:{}},res);assert.equal(res.statusCode,401)}
 finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old}
});
test('manual preflight is read-only and requires authentication',async()=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-secret';
 try{const res=response();await handler({method:'GET',headers:{authorization:'Bearer test-secret'}},res);assert.equal(res.statusCode,200);assert.equal(res.body.diagnostic,'manual-cron-entry');assert.match(res.body.note,/no database connection/)}
 finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old}
});
test('manual POST requires explicit run-once confirmation',async()=>{
 const old=process.env.CRON_SECRET;process.env.CRON_SECRET='test-secret';
 try{const res=response();await handler({method:'POST',headers:{authorization:'Bearer test-secret'}},res);assert.equal(res.statusCode,400)}
 finally{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old}
});
