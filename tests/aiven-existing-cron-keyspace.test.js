'use strict';
// Verify that the EXISTING production cron uses the EXISTING shared keyspace
// when REDIS_PROVIDER=valkey. All Redis and TMDB operations are mocked.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');

test('legacy 06:00 cron keeps doko:watch:v3 keys with Aiven provider',async()=>{
 const old={REDIS_PROVIDER:process.env.REDIS_PROVIDER,LEDGER_RELEASE_MODE:process.env.LEDGER_RELEASE_MODE,CRON_SECRET:process.env.CRON_SECRET,TMDB_API_KEY:process.env.TMDB_API_KEY};
 const valkeyPath=require.resolve('../api/_valkey');
 const redisPath=require.resolve('../api/_redis');
 const cronPath=require.resolve('../api/update-streaming');
 const oldValkey=require.cache[valkeyPath],oldRedis=require.cache[redisPath],oldCron=require.cache[cronPath];
 const values=new Map(),commands=[];
 const fakeCommand=async args=>{
  commands.push(args);
  const [op,...a]=args;
  if(op==='SET'){
   if(a[2]==='NX'&&values.has(a[0]))return null;
   values.set(a[0],a[1]);return 'OK';
  }
  if(op==='MGET')return a.map(k=>values.get(k)??null);
  if(op==='EVAL'){if(values.get(a[3])===a[4]){values.delete(a[3]);return 1}return 0}
  throw Error('Unexpected Redis command: '+op);
 };
 const originalFetch=global.fetch;
 try{
  process.env.REDIS_PROVIDER='valkey';delete process.env.LEDGER_RELEASE_MODE;
  process.env.CRON_SECRET='cron-test-secret';process.env.TMDB_API_KEY='tmdb-test-key';
  require.cache[valkeyPath]={id:valkeyPath,filename:valkeyPath,loaded:true,exports:{sharedValkey:()=>({command:fakeCommand})}};
  delete require.cache[redisPath];delete require.cache[cronPath];
  global.fetch=async url=>{
   assert.match(String(url),/^https:\/\/api\.themoviedb\.org\/3\/(movie|tv)\/\d+\/watch\/providers\?/);
   return {ok:true,json:async()=>({results:{JP:{flatrate:[{provider_id:8,logo_path:'/logo.png'}]}}})};
  };
  const cron=require('../api/update-streaming');
  const headers={};let status=200,payload;
  const res={setHeader:(k,v)=>{headers[k]=v},status:n=>{status=n;return res},json:v=>{payload=v;return res}};
  await cron({method:'GET',headers:{authorization:'Bearer cron-test-secret'}},res);
  assert.equal(status,200,JSON.stringify(payload));
  assert.ok(payload.total>0);
  assert.equal(payload.updated,payload.total);
  assert.equal(payload.failed,0);
  assert.equal(payload.complete,true);
  const writes=commands.filter(c=>c[0]==='SET'&&c[1].startsWith('doko:watch:v3:')&&c[1]!=='doko:watch:v3:refresh-lock');
  assert.equal(writes.length,payload.total);
  assert.ok(writes.every(c=>!c[1].startsWith('doko:ledger:')));
  const sample=JSON.parse(values.get(writes[0][1]));
  assert.equal(sample.flatrate[0].provider_id,8);
  assert.ok(sample.checkedAt);
  assert.equal(headers['Cache-Control'],'private, no-store');
 }finally{
  global.fetch=originalFetch;
  for(const [key,value] of Object.entries(old)){if(value===undefined)delete process.env[key];else process.env[key]=value}
  if(oldValkey)require.cache[valkeyPath]=oldValkey;else delete require.cache[valkeyPath];
  if(oldRedis)require.cache[redisPath]=oldRedis;else delete require.cache[redisPath];
  if(oldCron)require.cache[cronPath]=oldCron;else delete require.cache[cronPath];
 }
});
