'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../api/_release-dispatch.js'),'utf8');
function fixture({connect=()=>{throw Error('rediss://PRIVATE_TOKEN')},mode='new'}={}){
 const lines=[],calls=[];
 const res={writableEnded:false,setHeader(...args){calls.push(['header',...args]);return this},status(code){calls.push(['status',code]);return this},end(value){calls.push(['end',value]);this.writableEnded=true;return this}};
 const entry={observeDispatch:run=>run(),recordPreflightFailure:name=>{if(name==='update-streaming')lines.push('preflight')}};
 const dependencies={'./_streaming-cron-entry-observer':entry,'./_release-connection':{connect},'./_acquisition-guard':{session:()=>({})},'./_release-source':{source:()=>({})},'./_release-application':{application:()=>({handle:async()=>{calls.push(['handle'])}})}};
 const sandbox={module:{exports:{}},exports:{},process:{env:{LEDGER_RELEASE_MODE:mode}},require:name=>{if(!(name in dependencies))throw Error('Unexpected require '+name);return dependencies[name]},console:{info:()=>{},error:(...args)=>lines.push(args)}};
 vm.runInNewContext(source,sandbox,{filename:'_release-dispatch.js'});
 return {dispatch:sandbox.module.exports.dispatch,lines,calls,res};
}
test('connection setup failure returns 503 and safe cron marker without leaking credentials',async()=>{
 const f=fixture();assert.equal(await f.dispatch('update-streaming',{},f.res),true);
 assert.ok(f.calls.some(x=>x[0]==='status'&&x[1]===503));
 assert.ok(f.lines.includes('preflight'));
 assert.equal(JSON.stringify(f.lines).includes('PRIVATE_TOKEN'),false);
});
test('other routes retain original error reporting behavior',async()=>{
 const f=fixture();await f.dispatch('search',{},f.res);
 assert.equal(f.lines.includes('preflight'),false);
 assert.ok(f.lines.some(x=>Array.isArray(x)&&x[0]==='RELEASE_DISPATCH_FAILED'));
});
test('successful new mode dispatch invokes original handler',async()=>{
 const f=fixture({connect:()=>({config:{},command:()=>{},adminCommand:()=>{}})});
 assert.equal(await f.dispatch('update-streaming',{},f.res),true);
 assert.ok(f.calls.some(x=>x[0]==='handle'));
});
test('legacy mode bypasses release dispatch',async()=>{
 const f=fixture({mode:'legacy'});assert.equal(await f.dispatch('update-streaming',{},f.res),false);
 assert.equal(f.calls.length,0);
});
