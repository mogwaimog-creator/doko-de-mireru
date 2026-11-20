'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module');
test('full Aiven inventory reads DBSIZE, memory and all categories without writing',async()=>{
 const path=require.resolve('../api/admin-aiven-inventory'),valkeyPath=require.resolve('../api/_valkey');
 const original=require.cache[valkeyPath],oldToken=process.env.LEDGER_ADMIN_TOKEN,oldProvider=process.env.REDIS_PROVIDER,oldUrl=process.env.AIVEN_REDIS_URL;
 const calls=[];const fake=new Module(valkeyPath);fake.filename=valkeyPath;fake.loaded=true;fake.exports={sharedValkey:()=>({command:async args=>{calls.push(args);if(args[0]==='DBSIZE')return 7;if(args[0]==='INFO')return '# Memory\r\nused_memory:4096\r\n';if(args[0]==='SCAN')return ['0',['doko:dev:work:v2:movie:1','doko:dev:shared-stream:v1:record:movie:1','doko:dev:person:v2:2','doko:dev:season:v1:tv:3','doko:dev:seo:v1:movie:1','doko:dev:ops:v1:last-attempt','unclassified']];throw Error('unexpected command')}})};require.cache[valkeyPath]=fake;
 try{process.env.LEDGER_ADMIN_TOKEN='a'.repeat(40);process.env.REDIS_PROVIDER='valkey';process.env.AIVEN_REDIS_URL='rediss://example.invalid';const res={setHeader(){},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
 await require(path)({method:'GET',headers:{authorization:'Bearer '+'a'.repeat(40)},query:{}},res);
 assert.equal(res.statusCode,200);assert.equal(res.body.totalKeys,7);assert.equal(res.body.usedMemoryBytes,4096);assert.equal(res.body.complete,true);assert.deepEqual(res.body.categoryCountsThisPage,{works:1,streaming:1,people:1,seasons:1,seo:1,operations:1,acquisition:0,other:1});assert.deepEqual(calls.map(x=>x[0]),['DBSIZE','INFO','SCAN']);
 }finally{if(original)require.cache[valkeyPath]=original;else delete require.cache[valkeyPath];for(const [k,v] of [['LEDGER_ADMIN_TOKEN',oldToken],['REDIS_PROVIDER',oldProvider],['AIVEN_REDIS_URL',oldUrl]]){if(v===undefined)delete process.env[k];else process.env[k]=v}}
});
