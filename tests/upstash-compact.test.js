'use strict';
// Run with: node --test tests/upstash-compact.test.js
// No network calls, Redis writes, or third-party dependencies.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function loadModule(filename,dependencies,env={}){
  const module={exports:{}};
  const source=fs.readFileSync(path.join(__dirname,'..','api',filename),'utf8');
  const context={module,exports:module.exports,process:{env},console,Date,setTimeout,clearTimeout,require(name){
    if(!Object.hasOwn(dependencies,name))throw Error('Unexpected dependency: '+name);
    return dependencies[name];
  }};
  vm.runInNewContext(source,context,{filename});
  return module.exports;
}
function redis(){
  const data=new Map();
  return {data,async command(args){
    const [op,key,...rest]=args;
    if(op==='GET')return data.get(key)||null;
    if(op==='SET'){
      if(rest.includes('NX')&&data.has(key))return null;
      data.set(key,rest[0]);return 'OK';
    }
    if(op==='EVAL'){data.delete(args[3]);return 1;}
    throw Error('Unexpected Redis command: '+op);
  }};
}
test('person ledger saves compact credits, retains profile, reuses cache',async()=>{
  const r=redis();let calls=0;
  const {withPersonLedger}=loadModule('_person-ledger.js',{'./_redis':r,'node:crypto':{randomUUID:()=> 'test-token'}},{WORK_LEDGER_ENABLED:'1'});
  const person={id:42,biography:'profile',popularity:9,cast:[{id:10,title:'Example',release_status:'upcoming',poster_path:'/a.jpg',character:'Lead',overview:'long',original_title:'Original',popularity:4,vote_average:8}],voice:[],directed:[],documentary_talk:[],other:[]};
  const first=await withPersonLedger(42,async()=>{calls++;return person;});
  const saved=JSON.parse(r.data.get('doko:person:v1:42')).person;
  assert.equal(saved.biography,'profile');
  assert.equal(saved.popularity,9);
  assert.equal(saved.cast[0].release_status,'upcoming');
  assert.equal(saved.cast[0].poster_path,'/a.jpg');
  for(const key of ['overview','original_title','popularity','vote_average'])assert.equal(Object.hasOwn(saved.cast[0],key),false);
  assert.deepEqual(JSON.parse(JSON.stringify(first)),saved);
  const second=await withPersonLedger(42,async()=>{calls++;throw Error('unexpected refresh');});
  assert.equal(calls,1);
  assert.deepEqual(JSON.parse(JSON.stringify(second)),saved);
});
test('detail provider cache saves JP only, reuses cache',async()=>{
  const r=redis();let calls=0;
  const {getDetailProviders}=loadModule('_detail-providers-cache.js',{'./_redis':r,'./_work-ledger':{identity:(type,id)=>({type,id})},'node:crypto':{randomUUID:()=> 'test-token'}});
  const upstream={id:7,results:{JP:{flatrate:[{provider_id:1}],rent:[{provider_id:2}],buy:[{provider_id:3}]},US:{flatrate:[{provider_id:99}]}}};
  const first=await getDetailProviders('movie',7,async()=>{calls++;return upstream;});
  const saved=JSON.parse(r.data.get('doko:detail-providers:v1:movie:7')).data;
  assert.deepEqual(Object.keys(saved.results),['JP']);
  assert.equal(saved.results.JP.buy[0].provider_id,3);
  assert.deepEqual(JSON.parse(JSON.stringify(first.data)),saved);
  const second=await getDetailProviders('movie',7,async()=>{calls++;throw Error('unexpected refresh');});
  assert.equal(calls,1);
  assert.deepEqual(JSON.parse(JSON.stringify(second.data)),saved);
});
test('provider cache supports missing JP without inventing availability',async()=>{
  const r=redis();
  const {getDetailProviders}=loadModule('_detail-providers-cache.js',{'./_redis':r,'./_work-ledger':{identity:(type,id)=>({type,id})},'node:crypto':{randomUUID:()=> 'test-token'}});
  const response=await getDetailProviders('tv',8,async()=>({id:8,results:{US:{flatrate:[]}}}));
  assert.deepEqual(JSON.parse(JSON.stringify(response.data.results)),{});
});
