'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('legacy rollback reads saved old provider contract, while broken new mode stops without a legacy read',async()=>{
 const redis=require.resolve('../api/_redis'),reader=require.resolve('../api/_shared-streaming-read'),handlerPath=require.resolve('../api/series-watch'),connectionPath=require.resolve('../api/_release-connection'),saved=new Map([redis,reader,handlerPath,connectionPath].map(p=>[p,require.cache[p]])),oldMode=process.env.LEDGER_RELEASE_MODE;
 let legacyReads=0,newConnections=0;const stamp=new Date().toISOString();
 require.cache[redis]={exports:{command:async args=>{legacyReads++;assert.equal(args[0],'MGET');assert(args.slice(1).every(k=>k.startsWith('doko:watch:v3:')));return args.slice(1).map(()=>JSON.stringify({checkedAt:stamp,flatrate:[]}))}}};
 require.cache[reader]={exports:{enabled:()=>false,recoveryOnly:()=>false}};
 require.cache[connectionPath]={exports:{connect:()=>{newConnections++;throw Error('isolated new connection unavailable')}}};delete require.cache[handlerPath];
 const res=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.value=v;this.writableEnded=true;return this},end(v){this.value=v;this.writableEnded=true;return this}}),req={method:'GET',headers:{},query:{series:'kimetsu'}};
 try{const handler=require(handlerPath);process.env.LEDGER_RELEASE_MODE='new';let r=res();await handler(req,r);assert.equal(r.statusCode,503);assert.equal(legacyReads,0);assert.equal(newConnections,1);process.env.LEDGER_RELEASE_MODE='legacy';r=res();await handler(req,r);assert.equal(r.statusCode,200);assert.equal(r.value.complete,true);assert.equal(Object.keys(r.value.providers).length,3);assert.equal(legacyReads,1);assert.equal(newConnections,1);assert.equal(r.value.providers['movie:635302'].checkedAt,stamp)}finally{if(oldMode===undefined)delete process.env.LEDGER_RELEASE_MODE;else process.env.LEDGER_RELEASE_MODE=oldMode;for(const [p,v] of saved){if(v)require.cache[p]=v;else delete require.cache[p]}}
});
