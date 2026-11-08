'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const paths=['../api/_redis','../api/_work-ledger','../api/_work-first-load','../api/work-detail'].map(x=>require.resolve(x));
const original=new Map(paths.map(p=>[p,require.cache[p]]));
const values=new Map(),redisCalls=[];
require.cache[paths[0]]={id:paths[0],filename:paths[0],loaded:true,exports:{command:async args=>{
 redisCalls.push(args);const [cmd,key,value]=args;
 if(cmd==='GET')return values.get(key)||null;
 if(cmd==='SET'){if(args.includes('NX')&&values.has(key))return null;values.set(key,value);return 'OK';}
 if(cmd==='EVAL'){if(values.get(args[3])===args[4]){values.delete(args[3]);return 1;}return 0;}
 throw Error('Unexpected Redis command '+cmd);
}}};
for(const p of paths.slice(1))delete require.cache[p];
const handler=require('../api/work-detail');
const oldFetch=global.fetch;
const oldEnabled=process.env.WORK_LEDGER_ENABLED;
const oldKey=process.env.TMDB_API_KEY;
const oldWriteFlag=process.env.LEDGER_WRITES_RESUME;
test.after(()=>{if(oldWriteFlag===undefined)delete process.env.LEDGER_WRITES_RESUME;else process.env.LEDGER_WRITES_RESUME=oldWriteFlag});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;return this;}});
test.after(()=>{global.fetch=oldFetch;for(const [p,v] of original){if(v)require.cache[p]=v;else delete require.cache[p];}if(oldEnabled===undefined)delete process.env.WORK_LEDGER_ENABLED;else process.env.WORK_LEDGER_ENABLED=oldEnabled;if(oldKey===undefined)delete process.env.TMDB_API_KEY;else process.env.TMDB_API_KEY=oldKey;});
test.beforeEach(()=>{values.clear();redisCalls.length=0;process.env.LEDGER_WRITES_RESUME='1';process.env.WORK_LEDGER_ENABLED='1';process.env.TMDB_API_KEY='test-key';});
test('two simultaneous work-detail requests fetch TMDB once',async()=>{
 let calls=0;
 global.fetch=async()=>{calls++;await sleep(180);return {ok:true,json:async()=>({id:123,title:'映画A',release_date:'2000-01-01'})};};
 const a=response(),b=response();
 await Promise.all([handler({method:'GET',query:{type:'movie',id:'123'}},a),handler({method:'GET',query:{type:'movie',id:'123'}},b)]);
 assert.equal(calls,1);assert.equal(a.statusCode,200);assert.equal(b.statusCode,200);assert.equal(a.body.work.id,123);assert.equal(b.body.work.id,123);assert.equal(a.body.work.schemaVersion,1);assert.equal(b.body.work.schemaVersion,1);assert.equal(a.body.work.type,'movie');assert.equal(b.body.work.type,'movie');
});
test('work-detail never calls TMDB when feature is disabled',async()=>{
 process.env.WORK_LEDGER_ENABLED='0';let calls=0;global.fetch=async()=>{calls++;throw Error('should not fetch');};
 const r=response();await handler({method:'GET',query:{type:'movie',id:'123'}},r);assert.equal(r.statusCode,503);assert.equal(calls,0);
});
test('work-detail preserves TMDB 404',async()=>{
 global.fetch=async()=>({ok:false,status:404});const r=response();await handler({method:'GET',query:{type:'movie',id:'404'}},r);assert.equal(r.statusCode,404);
});
test('work-detail rejects mismatched TMDB ID',async()=>{
 global.fetch=async()=>({ok:true,json:async()=>({id:999,title:'Wrong'})});const r=response();await handler({method:'GET',query:{type:'movie',id:'888'}},r);assert.equal(r.statusCode,502);
});
test('slow initial fetch gives second visitor retryable busy response without duplicate TMDB call',async()=>{
 let calls=0;
 let release;
 const gate=new Promise(resolve=>{release=resolve;});
 global.fetch=async()=>{calls++;await gate;return {ok:true,json:async()=>({id:777,title:'映画B'})};};
 const first=response(),second=response();
 const pending=handler({method:'GET',query:{type:'movie',id:'777'}},first);
 await sleep(50);
 await handler({method:'GET',query:{type:'movie',id:'777'}},second);
 assert.equal(second.statusCode,503);
 assert.equal(second.body.code,'WORK_METADATA_BUSY');
 assert.equal(second.headers['Retry-After'],'5');
 assert.equal(calls,1);
 release();await pending;
 assert.equal(first.statusCode,200);
});

test('public work-detail response excludes internal notes and cached TMDB extensions',async()=>{
 const key='doko:work:v1:movie:321';
 values.set(key,JSON.stringify({
  schemaVersion:1,type:'movie',id:321,title:'公開作品',posterPath:'/poster.jpg',
  commonNotes:{private:'internal note'},pageExtras:{editor:{draft:'private'}},
  errors:['internal error'],verification:{notes:'private'},extensions:{tmdbDetail:{id:321,title:'公開作品',secret:'internal'}},
  checkedAt:'2026-11-03T00:00:00Z'
 }));
 let calls=0;global.fetch=async()=>{calls++;throw Error('should not fetch');};
 const r=response();
 await handler({method:'GET',query:{type:'movie',id:'321'}},r);
 assert.equal(r.statusCode,200);assert.equal(calls,0);
 assert.equal(r.body.work.title,'公開作品');assert.equal(r.body.work.posterPath,'/poster.jpg');
 for(const key of ['commonNotes','pageExtras','errors','verification','extensions','checkedAt']){
  assert.equal(Object.hasOwn(r.body.work,key),false,key+' should not be public');
 }
});

test('frozen work-detail coalesces verified metadata without any Redis writes or private fields',async()=>{
 process.env.LEDGER_WRITES_RESUME='0';let loads=0;
 global.fetch=async()=>{loads++;await sleep(10);return {ok:true,json:async()=>({id:635302,title:'無限列車編','watch/providers':{results:{JP:{}}}})}};
 const a=response(),b=response();await Promise.all([handler({method:'GET',query:{type:'movie',id:'635302'}},a),handler({method:'GET',query:{type:'movie',id:'635302'}},b)]);
 assert.equal(loads,1);assert.equal(a.statusCode,200);assert.equal(b.body.persisted,false);assert.equal(a.body.source,'upstream-unsaved');assert.equal(a.body.work.id,635302);assert(!Object.hasOwn(a.body.work,'extensions'));assert(!Object.hasOwn(a.body.work,'watch/providers'));assert(redisCalls.every(x=>x[0]==='GET'));assert.equal(values.size,0);
});
test('frozen work-detail rejects mismatched source IDs without persisting them',async()=>{
 process.env.LEDGER_WRITES_RESUME='0';global.fetch=async()=>({ok:true,json:async()=>({id:123,title:'wrong'})});const r=response();await handler({method:'GET',query:{type:'tv',id:'85937'}},r);assert.equal(r.statusCode,502);assert.equal(values.size,0);assert(redisCalls.every(x=>x[0]==='GET'));
});
