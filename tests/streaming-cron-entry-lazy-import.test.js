'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../api/update-streaming.js'),'utf8');
function load({mode='new',auth='Bearer valid'}={}){
 const calls=[],res={setHeader(){return this},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}};
 const sandbox={module:{exports:{}},exports:{},process:{env:{LEDGER_RELEASE_MODE:mode,CRON_SECRET:'valid'}},require(name){
  calls.push(name);
  if(name==='./_release-dispatch')return {dispatch:async()=>true};
  if(name==='./_redis')throw Error('legacy Redis must not load');
  if(name==='../data/streaming-works.json')throw Error('legacy roster must not load');
  throw Error('unexpected require: '+name);
 },console,Date,Math,AbortSignal,fetch:()=>{throw Error('unexpected fetch')}};
 vm.runInNewContext(source,sandbox,{filename:'update-streaming.js'});
 return {handler:sandbox.module.exports,res,calls,auth};
}
test('new-mode Cron never loads legacy Redis or legacy roster',async()=>{
 const f=load();await f.handler({method:'GET',headers:{authorization:f.auth}},f.res);
 assert.deepEqual(f.calls,['./_release-dispatch']);
});
test('legacy unauthorized request does not initialize Redis',async()=>{
 const f=load({mode:'legacy',auth:'Bearer invalid'});
 await f.handler({method:'GET',headers:{authorization:f.auth}},f.res);
 assert.equal(f.res.statusCode,401);assert.equal(f.calls.includes('./_redis'),false);
});
test('legacy authorized request still attempts the original Redis module',async()=>{
 const f=load({mode:'legacy'});
 await f.handler({method:'GET',headers:{authorization:f.auth}},f.res);
 assert.equal(f.res.statusCode,503);assert.ok(f.calls.includes('./_redis'));
});
