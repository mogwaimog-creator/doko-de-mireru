'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {validBearer}=require('../api/admin-refresh-streaming');
test('administrator token is required and compared exactly',()=>{
 const secret='a'.repeat(40);
 assert.equal(validBearer('Bearer '+secret,secret),true);
 assert.equal(validBearer('Bearer '+secret+'x',secret),false);
 assert.equal(validBearer('Bearer '+'b'.repeat(40),secret),false);
 assert.equal(validBearer('Basic '+secret,secret),false);
 assert.equal(validBearer(undefined,secret),false);
 assert.equal(validBearer('Bearer '+secret,'short'),false);
});
test('unauthenticated requests do not invoke the cron',async()=>{
 const handler=require('../api/admin-refresh-streaming');
 const old=process.env.LEDGER_ADMIN_TOKEN;
 process.env.LEDGER_ADMIN_TOKEN='a'.repeat(40);
 const makeRes=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.statusCode=n;return this},json(value){this.body=value;return this}});
 try{
  const res=makeRes();
  await handler({method:'POST',headers:{authorization:'Bearer invalid'}},res);
  assert.equal(res.statusCode,401);
  const wrongMethod=makeRes();
  await handler({method:'GET',headers:{}},wrongMethod);
  assert.equal(wrongMethod.statusCode,405);
 }finally{
  if(old===undefined)delete process.env.LEDGER_ADMIN_TOKEN;
  else process.env.LEDGER_ADMIN_TOKEN=old;
 }
});
