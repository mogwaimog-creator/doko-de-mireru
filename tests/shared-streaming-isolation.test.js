'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {sharedStore}=require('../api/_shared-streaming-store');
const {compatible,readMany}=require('../api/_shared-streaming-read');
const {command}=require('./helpers/local-redis');
const {service}=require('../prototype/streaming-ledger-service');
const catalog=require('../data/watch-order-memberships.json');
const {store}=require('../prototype/streaming-ledger');
const at='2026-11-09T00:00:00Z';
const empty=()=>({results:{JP:{flatrate:[],rent:[],buy:[]}}});
const fixture=()=>({results:{JP:{flatrate:[{provider_id:8,provider_name:'Test fixture',logo_path:'/fixture.png'}],rent:[{provider_id:9,provider_name:'Rental fixture'}]}}});
const local=(name,fn)=>test(name,{skip:!process.env.REDIS_TEST_CLI},async()=>{
 const prefix=`doko:dev:test:${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}:`;
 await fn(sharedStore(command,{prefix}),prefix);
});
local('real Redis: owner expiry, fencing, CAS, and token checked release',async db=>{
 assert.equal(await db.acquire('movie:635302','old',30),true);
 await new Promise(r=>setTimeout(r,50));
 assert.equal(await db.acquire('movie:635302','new',30000),true);
 const s=store();s.register('movie',635302);s.success('movie',635302,{JP:{}},at);const record=s.get('movie',635302);
 assert.equal(await db.saveIfOwner('movie:635302','old',record,0),false);
 assert.equal(await db.release('movie:635302','old'),false);
 assert.equal(await db.saveIfOwner('movie:635302','new',record,0),true);
 assert.equal(await db.saveIfOwner('movie:635302','new',record,0),false);
 assert.equal((await db.read('movie:635302')).revision,1);
 assert.equal(await db.release('movie:635302','new'),true);
});
local('real Redis: simultaneous workers fetch once, failed refresh preserves success',async db=>{
 let calls=0,fail=false;
 const s=service(db,async()=>{calls++;await new Promise(r=>setTimeout(r,15));if(fail)throw Error('simulated upstream disconnect');return fixture()});
 const results=await Promise.all(Array.from({length:12},()=>s.visit('tv',85937,at,[])));
 assert.equal(calls,1);assert.equal(results.filter(r=>r.updated).length,1);
 const before=await db.read('tv:85937');fail=true;
 await s.visit('tv',85937,'2026-11-10T00:00:00Z',[]);
 const after=await db.read('tv:85937');assert.deepEqual(after.japan,before.japan);assert.equal(after.lastSuccessAt,before.lastSuccessAt);
 assert.equal((await s.visit('tv',85937,'2026-11-10T00:29:59Z',[])).reason,'failure-cooldown');
 assert.equal(calls,2);
});
local('real Redis: all 13 series actual IDs deduplicate, six JST boundary and no visit refresh',async db=>{
 const rows=new Map();for(const [scope,works] of Object.entries(catalog))for(const w of works){const k=w.type+':'+w.id;if(!rows.has(k))rows.set(k,{...w,memberships:[]});rows.get(k).memberships.push({kind:'watchOrder',scope})}
 const works=[...rows.values()];let calls=0;
 const s=service(db,async()=>{calls++;return empty()},{maxConcurrency:3,cronBudgetMs:120000});
 assert((await s.cron('2026-11-08T20:59:59Z',works)).every(r=>!r.updated));assert.equal(calls,0);
 const results=await s.cron('2026-11-08T21:00:00Z',works);assert.equal(results.filter(r=>r.updated).length,works.length);assert.equal(calls,works.length);
 for(const w of works){const raw=await db.read(w.type+':'+w.id);assert(compatible(raw,w.type,w.id,Date.parse(at)));assert.equal((await s.visit(w.type,w.id,'2026-11-09T12:00:00Z',works)).reason,'series-uses-cron')}
 assert((await s.cron('2026-11-09T09:00:00Z',works)).every(r=>!r.updated));assert.equal(calls,works.length);
});
local('real Redis: save outage is distinct from fetch error and cannot erase stored success',async db=>{
 let fail=false;
 const wrapped={...db,saveAndRelease:async(...args)=>{if(fail)throw Error('simulated Redis disconnect');return db.saveAndRelease(...args)}};
 const s=service(wrapped,async()=>fixture());await s.visit('movie',1771,at,[]);const before=await db.read('movie:1771');fail=true;
 assert.equal((await s.visit('movie',1771,'2026-11-10T00:00:00Z',[])).reason,'save-failed');assert.deepEqual(await db.read('movie:1771'),before);
});
local('real Redis: isolated backup restores records into a different namespace',async(db,prefix)=>{
 const s=service(db,async()=>empty());await s.visit('movie',635302,at,[]);await s.visit('tv',85937,at,[]);
 const backup=await Promise.all(['movie:635302','tv:85937'].map(async k=>[k,await db.read(k)]));
 const restored=sharedStore(command,{prefix:prefix+'restore:'});
 for(const [k,r] of JSON.parse(JSON.stringify(backup))){assert.equal(await restored.acquire(k,'restore',30000),true);assert.equal(await restored.saveIfOwner(k,'restore',r,0),true);assert.deepEqual(await restored.read(k),r)}
});
test('read compatibility distinguishes never fetched, malformed, empty, stale, and movie/tv',()=>{
 const l=store();l.register('movie',635302);const r={...l.get('movie',635302),schemaVersion:1,revision:1};assert.equal(compatible(r,'movie',635302),null);
 l.success('movie',635302,{JP:{}},at);Object.assign(r,l.get('movie',635302));
 assert.deepEqual(compatible(r,'movie',635302,Date.parse(at)).watch.flatrate,[]);
 assert.equal(compatible(r,'tv',635302,Date.parse(at)),null);
 assert.equal(compatible({...r,japan:{}},'movie',635302,Date.parse(at)),null);
 assert.equal(compatible(r,'movie',635302,Date.parse('2026-11-11T00:00:00Z')).watch.stale,true);
});
test('development namespace and local endpoint guards reject production resources',async()=>{
 assert.throws(()=>sharedStore(()=>{}, {prefix:'doko:watch:v3:'}),/development/);
 const reader=require('../api/_shared-streaming-read');const prev={...process.env};
 try{process.env.SHARED_STREAMING_READ_ENABLED='1';process.env.VERCEL_ENV='production';assert.equal(reader.enabled(),false);
 process.env.SHARED_LEDGER_DEV_URL='https://production.example.com';await assert.rejects(reader.devCommand(['GET','x']),/local isolated/);
 }finally{process.env=prev}
});
local('real Redis: killed worker leaves prior data intact and TTL permits recovery',async(db,prefix)=>{
 const {spawn}=require('node:child_process'),{once}=require('node:events');
 const s=service(db,async()=>fixture());await s.visit('movie',635302,at,[]);const before=await db.read('movie:635302');
 const code=`const {command}=require('./tests/helpers/local-redis');const {sharedStore}=require('./api/_shared-streaming-store');sharedStore(command,{prefix:process.argv[1]}).acquire('movie:635302','crashed',150).then(ok=>{if(!ok)process.exit(2);console.log('acquired');setInterval(()=>{},1000)})`;
 const child=spawn(process.execPath,['-e',code,prefix],{cwd:require('node:path').join(__dirname,'..'),env:process.env,stdio:['ignore','pipe','pipe']});
 try{
  await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('child startup timeout')),4000);timer.unref()})]);
  const exited=once(child,'exit');child.kill('SIGKILL');await exited;
  assert.deepEqual(await db.read('movie:635302'),before);
  await new Promise(r=>setTimeout(r,180));assert.equal(await db.acquire('movie:635302','recovery',30000),true);
  assert.equal(await db.saveIfOwner('movie:635302','recovery',before,before.revision),true);
 }finally{child.kill('SIGKILL')}
});
local('real Redis: failed daily attempt is not retried until the next JST day',async db=>{
 let calls=0;const works=[{type:'tv',id:85937,memberships:[{kind:'watchOrder',scope:'kimetsu'},{kind:'watchOrder',scope:'duplicate-feature'}]}];
 const s=service(db,async()=>{calls++;throw Error('fixture failure')});
 await s.cron('2026-11-08T21:00:00Z',works);await s.cron('2026-11-09T09:00:00Z',works);assert.equal(calls,1);
 await s.cron('2026-11-09T21:00:00Z',works);assert.equal(calls,2);assert.equal((await db.read('tv:85937')).lastSuccessAt,null);
});
local('optimized claim and combined commit fence expired owners, preserve empty arrays, and release atomically',async db=>{
 const k='movie:635302';assert.equal((await db.claimAndRead(k,'old',30)).acquired,true);await new Promise(r=>setTimeout(r,50));
 const next=await db.claimAndRead(k,'new',30000);assert.equal(next.acquired,true);assert.equal(next.record,null);
 const l=store();l.register('movie',635302);l.success('movie',635302,{JP:{}},at);const record=l.get('movie',635302);
 assert.equal(await db.saveAndRelease(k,'old',record,0),false);assert.equal(await db.release(k,'old'),false);
 assert.equal(await db.saveAndRelease(k,'new',record,0),true);assert.equal((await command(['GET',db.keys.lockKey(k)])),null);
 const raw=await db.read(k);assert.deepEqual(raw.japan,{flatrate:[],rent:[],buy:[]});assert.equal(raw.revision,1);
 await db.claimAndRead(k,'wrong-version',30000);assert.equal(await db.saveAndRelease(k,'wrong-version',record,0),false);assert.equal((await db.read(k)).revision,1);
});
local('lost commit acknowledgement remains retry-safe without falsely recording a fetch failure',async(db,prefix)=>{
 let lost=true,loads=0;
 const storeWithLostAck=sharedStore(async args=>{
  const value=await command(args);if(lost&&args[0]==='EVAL'&&args[1]===require('../api/_shared-streaming-store').COMMIT_RELEASE){lost=false;throw Error('lost acknowledgement')}return value;
 },{prefix});
 const s=service(storeWithLostAck,async()=>{loads++;return empty()});
 assert.equal((await s.visit('movie',635302,at,[])).reason,'save-failed');assert((await db.read('movie:635302')).lastSuccessAt);
 assert.equal((await s.visit('movie',635302,at,[])).reason,'cached');assert.equal(loads,1);assert.deepEqual((await db.read('movie:635302')).errors,[]);
});
local('backwards caller clock cannot replace a later successful record',async db=>{
 let calls=0;const s=service(db,async()=>{calls++;return empty()});await s.visit('movie',635302,at,[]);const before=await db.read('movie:635302');
 const works=[{type:'movie',id:635302,memberships:[{kind:'watchOrder',scope:'kimetsu'}]}];
 assert.equal((await s.update('movie',635302,'2026-11-08T00:00:00Z','cron',works)).reason,'clock-moved-backwards');assert.equal(calls,1);assert.deepEqual(await db.read('movie:635302'),before);
});
local('optimized refresh returns the committed schema and revision immediately, including failure records',async db=>{
 let fail=false;const s=service(db,async()=>{if(fail)throw Error('upstream fixture failure');return empty()});
 const first=await s.visit('movie',635302,at,[]);assert.equal(first.record.schemaVersion,1);assert.equal(first.record.revision,1);assert.deepEqual(first.record,await db.read('movie:635302'));
 fail=true;const second=await s.visit('movie',635302,'2026-11-10T00:00:00Z',[]);assert.equal(second.record.revision,2);assert.deepEqual(second.record,await db.read('movie:635302'));
});
