'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {command}=require('./helpers/local-redis'),{contentStore}=require('../api/_dev-content-store'),{coordinator}=require('../api/_content-ledger-coordinator');
const at='2026-11-09T00:00:00Z';
let sequence=0;
function local(name,fn){test(name,{skip:!process.env.REDIS_TEST_CLI},async()=>{const id=600000000+process.pid*200+(++sequence);await fn(contentStore(command),id)})}
local('independent content workers share a lease; person, season and episode calls fetch once',async(store,id)=>{
 const a=coordinator(store),b=coordinator(contentStore(command));let loads=0;let entered,finish;const ready=new Promise(r=>entered=r),gate=new Promise(r=>finish=r);
 const load=async()=>{loads++;entered();await gate;return {id,name:'person',cast:[],voice:[],directed:[],documentary_talk:[],other:[]}};
 const first=a.person(id,load,at);await ready;assert.equal((await b.person(id,load,at)).status,'in-flight');finish();assert.equal((await first).status,'saved');assert.equal(loads,1);
 let release;const block=new Promise(r=>release=r);let opened;const begun=new Promise(r=>opened=r);let calls=0;
 const manifest=a.seasons(id,async()=>{calls++;opened();await block;return {tvId:id,seasons:[{seasonNumber:1,episodeCount:1}]}},at);await begun;
 assert.equal((await b.seasons(id,async()=>{calls++;throw Error('duplicate')},at)).status,'in-flight');release();await manifest;assert.equal(calls,1);
 const episode=await a.episode(id,1,async()=>({tvId:id,seasonNumber:1,episodes:[{episodeNumber:1,name:'one'}]}),at);assert.equal(episode.status,'saved');assert.equal((await b.episode(id,1,async()=>{throw Error('duplicate')},at)).status,'cached');
});
local('expired content owner cannot commit or release a replacement lease',async(store,id)=>{
 const key=store.keys.person(id);assert(await store.claimLease(key,'old',20));await new Promise(r=>setTimeout(r,30));assert(await store.claimLease(key,'new',1000));
 const person=require('../prototype/person-ledger').store().success({id,name:'person'},at);assert.equal((await store.commit([{key,data:person,revision:0}],{lease:{key,token:'old'}})).reason,'lease-lost');assert.equal(await store.releaseLease(key,'old'),false);assert.equal(await store.noteFailure(key,0,{lastError:'late'},{key,token:'old'}),false);assert(await store.releaseLease(key,'new'));
});
local('first-load timeout persists cooldown and ignores late success without a partial save',async(store,id)=>{
 const c=coordinator(store,{timeoutMs:10,leaseMs:100});let aborted=false,loads=0;
 const result=await c.person(id,async signal=>{loads++;await new Promise(r=>setTimeout(r,40));aborted=signal.aborted;return {id,name:'late'}},at);assert.equal(result.status,'failed');assert.equal((await c.person(id,async()=>{loads++;return {id,name:'again'}},at)).status,'cooldown');await new Promise(r=>setTimeout(r,50));assert(aborted);assert.equal(loads,1);assert.equal((await store.read([store.keys.person(id)]))[store.keys.person(id)].data,null);
});
local('separate Node process owns content lease and prevents a second process from fetching',async(store,id)=>{
 const {spawn}=require('node:child_process'),{once}=require('node:events');const code=`const {command}=require('./tests/helpers/local-redis');const {coordinator}=require('./api/_content-ledger-coordinator');const {contentStore}=require('./api/_dev-content-store');const id=Number(process.argv[1]);coordinator(contentStore(command)).person(id,async()=>{console.log('fetch');await new Promise(r=>setTimeout(r,250));return {id,name:'child',cast:[],voice:[],directed:[],documentary_talk:[],other:[]}},'2026-11-09T00:00:00Z').then(r=>{if(r.status!=='saved')process.exitCode=2})`;
 const child=spawn(process.execPath,['-e',code,String(id)],{cwd:require('node:path').join(__dirname,'..'),env:process.env,stdio:['ignore','pipe','pipe']});const ended=once(child,'exit');let timer;
 try{await Promise.race([once(child.stdout,'data'),new Promise((_,rej)=>timer=setTimeout(()=>rej(Error('worker timeout')),3000))]);let loads=0;assert.equal((await coordinator(store).person(id,async()=>{loads++;throw Error('duplicate')},at)).status,'in-flight');assert.equal(loads,0);assert.equal((await ended)[0],0)}finally{clearTimeout(timer);child.kill('SIGKILL')}
});
test('saved search filters canonical records, normalizes names, paginates and never fetches upstream',async()=>{
 const previous={...process.env};try{process.env.DEV_CONTENT_LEDGER_ENABLED='1';delete process.env.NODE_ENV;delete process.env.VERCEL_ENV;
 const {search,CATALOG}=require('../api/_dev-ledger-search'),{keys}=require('../api/_dev-content-ledgers'),{normalizeWorkV2}=require('../api/_work-ledger-v2-schema');const rows=Array.from({length:25},(_,i)=>normalizeWorkV2('movie',i+1,{title:'スター・ウォーズ '+i}));const records=new Map(rows.map(w=>[keys.work(w.type,w.id),w]));records.set(CATALOG,{schemaVersion:1,works:rows.map(w=>({type:w.type,id:w.id})),people:[1813]});records.set(keys.person(1813),require('../prototype/person-ledger').store().success({id:1813,name:'試験・人物'},at));let calls=0;const command=async args=>{calls++;assert(['GET','MGET'].includes(args[0]));return args[0]==='GET'?JSON.stringify(records.get(args[1])):args.slice(1).map(k=>records.has(k)?JSON.stringify(records.get(k)):null)};
 assert.equal((await search('ｽﾀｰｳｫｰｽﾞ',{command})).results.length,20);const second=await search('スターウォーズ',{page:2,command});assert.equal(second.results.length,5);assert(!second.hasMore);assert.equal((await search('試験人物',{kind:'person',command})).results[0].id,1813);assert.equal((await search('missing',{command})).total,0);assert.equal(calls,12);
 process.env.NODE_ENV='production';assert.equal(await search('x',{command:()=>{throw Error('must not connect')}}),null);
 }finally{process.env=previous}
});
local('storage write failure latches a shared stop before another worker fetches',async(store,id)=>{
 const controlKey=`doko:dev:content-control:test:${id}`;let loads=0;const broken=async args=>{if(args[0]==='EVAL'&&args[1].includes("redis.call('MSET'"))throw Error('simulated write outage');return command(args)};
 const a=coordinator(contentStore(broken,{controlKey})),b=coordinator(contentStore(command,{controlKey}));const load=async()=>{loads++;return {id,name:'fixture',cast:[],voice:[],directed:[],documentary_talk:[],other:[]}};
 assert.equal((await a.person(id,load,at)).status,'storage-error');assert.equal((await b.person(id,load,at)).status,'paused');assert.equal(loads,1);assert.equal((await contentStore(command,{controlKey}).readControl()).status,'paused');
});
