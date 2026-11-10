'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{command:native}=require('./helpers/local-redis'),guardModule=require('../api/_acquisition-guard');
function harness({limits={},baseline={}}={}){
 const client=require('../api/_release-transport-candidate').createTransport({endpoint:'https://redis.invalid',token:'not-a-real-token-123456789',releaseSha256:require('node:crypto').randomBytes(32).toString('hex'),phase:'new',enabled:true,scripts:require('../api/_release-transport-candidate').coreScripts(),maxRequests:10000,maxReservedCommands:100000,request:async(_url,opt)=>{const args=JSON.parse(opt.body);calls.push(args);return new Response(JSON.stringify({result:await native(args)}))}}),command=require('../api/_release-connection').bind(client),calls=[];let time=Date.parse('2026-11-10T01:00:00Z');const guard=guardModule.session(command,{clock:()=>time}),runtime=require('../api/_cutover-runtime-dev').runtime(command,{guard,clock:()=>time,requireInitializedControl:true});
 return {command,client,calls,guard,runtime,seed:(key,value)=>native(['SET',client.prefix+key.replace(/^doko:dev:/,''),value]),clock:()=>time,setTime:n=>{time=n},async init(){await command(['SET','doko:dev:content-control:v1','{"status":"ready","newWorkDailyLimit":300}']);await command(['SET',guardModule.KEY,JSON.stringify(guardModule.initial({...baseline,limits}))]);},run:fn=>guard.withContext(()=>runtime.run('guard-test',fn))};
}
test('all upstream route families use shared guard; daily scheduled lane stays distinct',async()=>{
 const h=harness();await h.init();let loads=0;const source=require('../api/_release-source').source({command:h.command,apiKey:'fixture',dailyLimit:300,guard:h.guard,clock:h.clock,request:async url=>{loads++;const path=new URL(url).pathname,m=path.match(/\/(movie|tv|person)\/(\d+)/);return new Response(JSON.stringify(path.endsWith('/watch/providers')?{results:{}}:path.includes('/season/')?{season_number:2,episodes:[]}:m?{id:Number(m[2])}:{results:[]}))}});
 const paths=['/3/search/movie','/3/movie/999','/3/person/123','/3/person/123/combined_credits','/3/tv/99/season/2','/3/movie/999/watch/providers'];
 for(const path of paths)await h.run(()=>source(path));assert.equal(loads,paths.length);let state=await h.guard.status();assert.equal(state.daily,paths.length);assert.equal(state.dailyScheduled,0);
 await h.run(()=>source('/3/movie/1678/watch/providers',{},undefined,{scheduled:true}));state=await h.guard.status();assert.equal(state.dailyScheduled,1);assert.equal(Object.keys(state.inflight).length,0);
});
test('acquisition-rate latch survives new sessions while saved reads still work',async()=>{
 const h=harness({limits:{acquisitionsPerMinute:2}});await h.init();await h.seed('doko:dev:work:v2:movie:1','{"id":1,"title":"saved"}');
 for(let i=0;i<2;i++)await h.run(()=>h.guard.admit('/3/movie/'+i,{}));await assert.rejects(h.run(()=>h.guard.admit('/3/movie/3',{})),e=>e.code==='ACQUISITION_STOPPED');
 assert.equal((await h.guard.status()).paused,true);h.setTime(h.clock()+3600000);const value=await h.run(async()=>{assert.equal(h.guard.isPaused(),true);return JSON.parse(await h.command(['GET','doko:dev:work:v2:movie:1']))});assert.equal(value.title,'saved');assert.equal((await h.guard.status()).paused,true);
});
test('five upstream failures latch stop; one identity cools down without another fetch',async()=>{
 const h=harness();await h.init();let loads=0;const source=require('../api/_release-source').source({command:h.command,apiKey:'fixture',dailyLimit:300,guard:h.guard,clock:h.clock,request:async()=>{loads++;throw Error('fixture failure')}});
 await assert.rejects(h.run(()=>source('/3/person/1')));await assert.rejects(h.run(()=>source('/3/person/1')));assert.equal(loads,1);
 for(let i=2;i<=5;i++)await assert.rejects(h.run(()=>source('/3/person/'+i)));assert.equal(loads,5);assert.equal((await h.guard.status()).reason,'upstream-failures');
 const before=h.calls.length;await assert.rejects(h.run(()=>source('/3/person/6')));assert.equal(loads,5);assert.equal(h.calls.length-before,2,'only existing ingress/egress RPCs, no additional stop polling');
});
test('command/storage uncertainty fails closed without pretending account metrics exist',async()=>{
 for(const baseline of [{commandUnits:35000},{writeUpperBytes:7000000}]){const h=harness({baseline});await h.init();await assert.rejects(h.run(()=>h.guard.admit('/3/movie/99',{})),e=>e.code==='ACQUISITION_STOPPED');assert.equal((await h.guard.status()).paused,true)}
 const h=harness();await h.init();await h.command(['SET',guardModule.KEY,'{}']);await assert.rejects(h.run(()=>h.guard.admit('/3/movie/99',{})));const saved=await h.run(()=>h.command(['GET','doko:dev:content-control:v1']));assert.equal(JSON.parse(saved).status,'ready');
});
test('request spike stops acquisition but not stored response, no scans/INFO polling',async()=>{
 const h=harness({limits:{requestsPerMinute:2}});await h.init();for(let i=0;i<4;i++)assert.equal(await h.run(async()=>JSON.parse(await h.command(['GET','doko:dev:content-control:v1'])).status),'ready');assert.equal((await h.guard.status()).reason,'request-rate');assert(!h.calls.some(c=>['INFO','SCAN','KEYS','MEMORY'].includes(c[0])));
});
test('data-write reservation stops before sending oversized publication; original data survives',async()=>{
 const h=harness();await h.init();const key='doko:dev:work:v2:movie:1';await h.seed(key,'{"id":1,"title":"saved"}');await assert.rejects(h.run(async()=>{await h.guard.admit('/3/movie/1',{});await h.command(['SET',key,JSON.stringify({title:'x'.repeat(600000)})])}),e=>e.code==='ACQUISITION_STOPPED');assert.equal(JSON.parse(await h.command(['GET',key])).title,'saved');assert.equal((await h.guard.status()).reason,'write-reservation');
});
test('concurrent source reservations cannot oversubscribe the command bound',async()=>{
 const h=harness({baseline:{commandUnits:25000}});await h.init();let release;const wait=new Promise(r=>release=r),first=h.run(async()=>{await h.guard.admit('/3/person/1',{});await wait});await new Promise(r=>setTimeout(r,50));await assert.rejects(h.run(()=>h.guard.admit('/3/person/2',{})));release();await first;assert.equal(Object.keys((await h.guard.status()).inflight).length,0);
});
test('paused public routes retain stored movie, person, season and cached search data',async()=>{
 const h=harness();await h.init();let loads=0;const now=new Date(h.clock()).toISOString(),work=require('../api/_new-work-ingest').canonical('tv',99,{id:99,name:'Saved TV',genres:[],credits:{cast:[],crew:[]},status:'Returning Series'});
 await h.seed('doko:dev:work:v2:tv:99',JSON.stringify(work));
 const seasons=require('../prototype/season-ledger').makeRecord(99,[{seasonNumber:1,name:'Saved season',episodeCount:1,episodes:[{episodeNumber:1,name:'Saved episode'}],episodesCheckedAt:now}],now,null,7);await h.seed('doko:dev:season:v1:tv:99',JSON.stringify(seasons));
 const people=require('../prototype/person-ledger').store(),person=people.success({id:123,name:'Saved person',cast:[],voice:[],directed:[],documentary_talk:[],other:[]},now);await h.seed('doko:dev:person:v2:123',JSON.stringify(person));
 const ledger=require('../prototype/streaming-ledger').store();ledger.register('tv',99);ledger.success('tv',99,{JP:{flatrate:[],rent:[],buy:[]}},now);await h.seed('doko:dev:shared-stream:v1:record:tv:99',JSON.stringify({...ledger.get('tv',99),schemaVersion:1,revision:1}));
 await h.command(['EVAL',guardModule.TRIP,'1',guardModule.KEY,'operator-test']);
 const app=require('../api/_release-application').application({command:h.command,guard:h.guard,config:{},clock:h.clock,source:async()=>{loads++;throw Error('must not fetch')}});
 for(const query of [{id:'99',type:'tv'},{id:'99',type:'tv',season:'1'},{personId:'123'}]){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.value=v;this.writableEnded=true},end(v){this.value=v;this.writableEnded=true}};await app.handle('search',{method:'GET',headers:{},query},res);assert.equal(res.statusCode,200);assert(res.value.title==='Saved TV'||res.value.name==='Saved person'||res.value.episodes[0].name==='Saved episode')}
 const cache=require('../api/_recovery-fetch-cache').cache(h.command),identity='/3/search/movie?query=saved',digest=require('node:crypto').createHash('sha256').update(identity).digest('hex'),key='doko:dev:recovery:v1:query:'+parseInt(digest.slice(0,8),16)%64;await h.seed(key,JSON.stringify({identity,data:{results:[{id:1,title:'Saved search'}]}}));
 const result=await h.run(()=>cache.load('https://api.themoviedb.org'+identity,async()=>{loads++;throw Error('must not fetch')}));assert.equal(result.results[0].title,'Saved search');assert.equal(loads,0);assert.equal(JSON.parse(await h.command(['GET','doko:dev:content-control:v1'])).status,'ready');
});
test('malformed successful upstream response cools down just like HTTP failures',async()=>{
 const h=harness();await h.init();let loads=0;const source=require('../api/_release-source').source({command:h.command,apiKey:'fixture',dailyLimit:300,guard:h.guard,clock:h.clock,request:async()=>{loads++;return new Response('{"error":"bad payload"}')}});await assert.rejects(h.run(()=>source('/3/search/movie',{query:'bad'})));await assert.rejects(h.run(()=>source('/3/search/movie',{query:'bad'})));assert.equal(loads,1);
});
