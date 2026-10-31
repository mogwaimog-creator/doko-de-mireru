'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/admin-status');
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.code=code;return this;},json(body){this.body=body;return this;}};}
test('admin status refuses access without separately configured admin token',async()=>{
 const before=process.env.ADMIN_STATUS_SECRET;
 process.env.ADMIN_STATUS_SECRET='test-only-admin-secret';
 try{
   let res=response();
   await handler({method:'GET',headers:{}},res);
   assert.equal(res.code,401);
   assert.equal(res.headers['Cache-Control'],'private, no-store');
   res=response();
   await handler({method:'POST',headers:{authorization:'Bearer test-only-admin-secret'}},res);
   assert.equal(res.code,405);
 } finally {
   if(before===undefined)delete process.env.ADMIN_STATUS_SECRET;
   else process.env.ADMIN_STATUS_SECRET=before;
 }
});
