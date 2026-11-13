'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {command:native}=require('./helpers/local-redis');
const transport=require('../api/_release-transport-candidate'),connection=require('../api/_release-connection');
const {contentStore}=require('../api/_dev-content-store'),{normalizeWorkV2}=require('../api/_work-ledger-v2-schema');
const {session}=require('../api/_acquisition-guard'),{source}=require('../api/_release-source');
const application=require('../api/_release-application').application;
const local=(name,fn)=>test(name,{skip:!process.env.REDIS_TEST_CLI},fn);
const NOW=Date.parse('2026-11-13T01:00:00Z'),old='2026-01-01T00:00:00Z';
const payload={results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix',logo_path:'/fixture.png'}],rent:[],buy:[]}}};
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(value){this.value=value;this.writableEnded=true;return this},end(value){this.value=value;this.writableEnded=true;return this}}}
async function fixture(factory=application){
 const client=transport.createTransport({endpoint:'https://redis.invalid',token:'isolated-test-token-not-real',releaseSha256:randomBytes(32).toString('hex'),phase:'new',enabled:true,scripts:transport.coreScripts(),request:async(url,options)=>{assert.equal(url,'https://redis.invalid/');return new Response(JSON.stringify({result:await native(JSON.parse(options.body))}))}});
 const bound=connection.bind(client),calls=[],command=async args=>{calls.push(args);return bound(args)};
 const store=contentStore(command);await command(['SET','doko:dev:content-control:v1','{"status":"ready","newWorkDailyLimit":100}']);
 const works=[normalizeWorkV2('movie',90000001,{title:'保存作品 Movie',originalTitle:'Saved film',genres:['アクション'],releaseDate:'2023-01-01',posterPath:'/film.png',rating:8,overview:'保存された概要'}),normalizeWorkV2('tv',90000002,{title:'保存作品 Anime',genres:['アニメーション'],releaseDate:'2024-01-01',rating:7})];
 for(const work of works)assert((await store.commit([{key:store.keys.work(work.type,work.id),revision:0,data:work}])).saved);
 const season=require('../prototype/season-ledger').makeRecord(90000002,[{seasonNumber:1,name:'保存シーズン',episodes:[{episodeNumber:1,name:'保存エピソード'}],episodesCheckedAt:old}],old);
 const person=require('../prototype/person-ledger').store().success({id:90000003,name:'保存人物',cast:[{id:90000001,media_type:'movie',title:'保存作品 Movie'}]},old);
 assert((await store.commit([{key:store.keys.season(90000002),revision:0,data:season},{key:store.keys.person(90000003),revision:0,data:person}])).saved);
 let now=NOW,fail=false,fetches=[];const guard=session(command,{clock:()=>now});
 const load=source({command,guard,clock:()=>now,apiKey:'fixture',dailyLimit:1000,request:async url=>{const path=new URL(url).pathname;fetches.push(path);assert(path.endsWith('/watch/providers'),'non-streaming upstream forbidden');if(fail)throw Error('fixture upstream outage');return new Response(JSON.stringify(payload))}});
 const app=factory({command,guard,source:load,config:{cronSecret:'fixture-cron'},clock:()=>now});
 async function read(query,route='search'){calls.length=0;fetches=[];const res=response();await app.handle(route,{method:'GET',headers:{authorization:'Bearer fixture-cron'},query},res);return {res,calls:[...calls],fetches:[...fetches],count:calls.length}}
 async function savedStream(type,id,at){const s=require('../prototype/streaming-ledger').store();s.register(type,id);s.success(type,id,require('../prototype/streaming-ledger-compat').fromTmdb(payload),at);await command(['SET','doko:dev:shared-stream:v1:record:'+type+':'+id,JSON.stringify({...JSON.parse(s.save()).records[0],schemaVersion:1,revision:1})]);}
 return {read,command,store,savedStream,setNow:value=>now=value,setFail:value=>fail=value,client,works};
}
async function paused(fn){
 const keys=['NON_STREAMING_ACQUISITION_PAUSED','PERSON_LEDGER_WRITES_PAUSED','LEDGER_RELEASE_MODE','TMDB_API_KEY'],before=keys.map(k=>process.env[k]),fetchBefore=global.fetch;
 process.env.NON_STREAMING_ACQUISITION_PAUSED='1';delete process.env.PERSON_LEDGER_WRITES_PAUSED;process.env.LEDGER_RELEASE_MODE='new';process.env.TMDB_API_KEY='synthetic-fixture-key';
 global.fetch=()=>{throw Error('External network forbidden in paused ledger tests')};
 try{await fn()}finally{global.fetch=fetchBefore;keys.forEach((k,i)=>{if(before[i]===undefined)delete process.env[k];else process.env[k]=before[i]})}
}
function noAcquisition(calls){for(const args of calls){if(args[0]==='EVAL')assert(![require('../api/_dev-content-store').CLAIM_LEASE,require('../api/_new-work-ingest').RESERVE,require('../api/_dev-content-store').NOTE_FAILURE,require('../api/_dev-content-store').COMMIT,require('../api/_recovery-fetch-cache').CLAIM,require('../api/_acquisition-guard').ADMIT,require('../api/_acquisition-guard').ENTER].includes(args[1]),'unexpected acquisition/metadata write')}}
local('paused work/person/season display retains stale saved content; repeated misses never acquire',()=>paused(async()=>{
 const f=await fixture();
 for(const type of ['movie','tv']){
  const id=type==='movie'?90000001:90000002;
  const r=await f.read({type,id:String(id)},'work-detail');assert.equal(r.res.statusCode,200);assert.equal(r.count,2);assert.equal(r.res.value.work.title,f.works.find(w=>w.type===type).title);noAcquisition(r.calls);
  for(let n=0;n<3;n++){for(const route of ['search','work-detail','detail-page']){const missing=await f.read({type,id:'99999999'},route);assert.equal(missing.res.statusCode,503);assert.equal(missing.count,route==='detail-page'?3:2);assert.equal(missing.fetches.length,0);noAcquisition(missing.calls)}}
 }
 for(const query of [{personId:'90000003'},{id:'90000002',type:'tv',season:'1'}]){const r=await f.read(query);assert.equal(r.res.statusCode,200);assert.equal(r.count,2);noAcquisition(r.calls);assert.equal(r.fetches.length,0)}
 for(const query of [{personId:'99999999'},{id:'90000002',type:'tv',season:'2'},{id:'99999999',type:'tv',season:'1'}]){const r=await f.read(query);assert.equal(r.res.statusCode,503);assert.equal(r.count,2);noAcquisition(r.calls)}
 const episode=await f.read({id:'90000002',type:'tv',season:'1'});assert.equal(episode.res.value.episodes[0].name,'保存エピソード');
}));
local('saved index search, person search, anime cards, popularity and filters work with no query cache',()=>paused(async()=>{
 const f=await fixture();
 for(const [q,length]of [[{query:'保存作品',type:'all'},2],[{query:'保存作品',type:'movie'},1],[{query:'保存作品',type:'tv'},1],[{query:'保存作品',type:'anime'},1],[{personSearch:'保存人物'},1],[{query:'存在しない作品'},0],[{popular:'1'},1],[{genreBrowse:'1',genre:'action'},1],[{advancedSearch:'1',type:'movie',year:'2020',rating:'7'},1]]){const r=await f.read(q);assert.equal(r.res.statusCode,200,JSON.stringify(q));assert.equal(r.res.value.results.length,length,JSON.stringify(q));assert.equal(r.res.value.scope,'saved-only');noAcquisition(r.calls);assert.equal(r.fetches.length,0)}
 const anime=(await f.read({query:'保存作品',type:'anime'})).res.value;assert.equal(anime.tvAnime[0].content_type,'anime_tv');assert.equal(anime.results[0].display_type,'anime');
 const popular=await f.read({popular:'1'});assert.equal(popular.count,3);assert.equal(popular.res.value.results[0].poster_path,'/film.png');
 await f.savedStream('movie',90000001,new Date(NOW).toISOString());const provider=await f.read({advancedSearch:'1',provider:'netflix'});assert.equal(provider.res.value.results[0].id,90000001);assert.equal(provider.fetches.length,0);
 const cards=await f.read({query:'保存作品',type:'all'});assert.equal(cards.res.value.results.find(w=>w.id===90000001).streaming[0].logo_path,'/fixture.png');assert.equal(cards.fetches.length,0);assert.equal(cards.calls.filter(a=>a[0]==='MGET').length,1);
 const country=await f.read({advancedSearch:'1',country:'jp'});assert.deepEqual(country.res.value.unavailableFilters,['country']);
 assert.equal((await f.read({query:'   '})).res.statusCode,400);
}));
local('SEO preserves saved movie/TV title, H1, canonical, JSON-LD and provider names without refresh',()=>paused(async()=>{
 const f=await fixture();for(const type of ['movie','tv']){const id=type==='movie'?90000001:90000002;await f.savedStream(type,id,old);const r=await f.read({type,id:String(id)},'detail-page');assert.equal(r.res.statusCode,200);assert.equal(r.count,4);assert.match(r.res.value,/<title>[^<]*保存作品/);assert.match(r.res.value,/<h1[^>]*>保存作品/);assert.match(r.res.value,/rel="canonical"/);assert(r.res.value.includes('id='+id));assert.match(r.res.value,/application\/ld\+json/);assert.match(r.res.value,/Netflix/);assert.equal(r.fetches.length,0);noAcquisition(r.calls)}}));
local('ordinary streaming keeps 24h boundary, failures and last good logos, using one initial read',()=>paused(async()=>{
 const f=await fixture();await f.savedStream('movie',90000001,new Date(NOW).toISOString());
 let r=await f.read({id:'90000001'});assert.equal(r.count,3);assert.equal(r.fetches.length,0);assert.equal(r.res.value.streaming[0].logo_path,'/fixture.png');
 f.setNow(NOW+86400000-1);assert.equal((await f.read({id:'90000001'})).fetches.length,0);
 f.setNow(NOW+86400000);r=await f.read({id:'90000001'});assert.equal(r.count,8);assert.equal(r.fetches.length,1);
 f.setNow(NOW+2*86400000);f.setFail(true);r=await f.read({id:'90000001'});assert.equal(r.count,9);assert.equal(r.res.value.streaming[0].logo_path,'/fixture.png');assert.equal(r.res.value.streamingMeta.lastSuccessAt,new Date(NOW+86400000).toISOString());assert.equal((await f.read({id:'90000001'})).fetches.length,0);
}));
local('all 13 rosters retain 266 scheduled updates at 06 JST; repeated cron and visits never refetch',()=>paused(async()=>{
 const f=await fixture(),day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'}),six=Date.parse(day+'T06:00:00+09:00');f.setNow(six-1);
 let r=await f.read({},'update-streaming');assert.equal(r.fetches.length,0);
 f.setNow(six);r=await f.read({},'update-streaming');assert.equal(r.res.statusCode,200);assert.equal(r.fetches.length,266);assert.equal(r.count,291);
 assert.equal((await f.read({},'update-streaming')).fetches.length,0);
 for(const series of Object.keys(require('../data/watch-order-memberships.json'))){r=await f.read({series},'series-watch');assert.equal(r.res.statusCode,200);assert.equal(r.res.value.complete,true);assert.equal(r.count,2);assert.equal(r.fetches.length,0)}
}));
local('command comparison against pre-fix production application (top-level calls, not billed COMMANDS)',()=>paused(async()=>{
 const {execFileSync}=require('node:child_process'),Module=require('node:module'),path=require('node:path');
 const filename=path.resolve(__dirname,'../api/_release-application.baseline.js');
 const baseline=new Module(filename,module);baseline.filename=filename;baseline.paths=module.paths;
 baseline._compile(execFileSync('git',['show','3d6af1f3fefaa4ba2142708c375ca3cd3b027a65:api/_release-application.js'],{encoding:'utf8'}),filename);
 const before=await fixture(baseline.exports.application),after=await fixture(),rows=[];
 for(const [label,q,route,b,a]of [
  ['missing movie',{id:'99999999'},'search',8,2],['missing TV',{id:'99999999',type:'tv'},'search',8,2],
  ['missing SSR',{id:'99999999'},'detail-page',9,3],['saved SSR',{id:'90000001'},'detail-page',5,4],
  ['stale person',{personId:'90000003'},'search',6,2],['stale episodes',{id:'90000002',type:'tv',season:'1'},'search',10,2],
  ['query miss',{query:'存在しない作品'},'search',4,3],['saved query',{query:'保存作品',type:'all'},'search',4,5],
  ['anime query',{query:'保存作品',type:'anime'},'search',6,5],['popular miss',{popular:'1'},'search',8,3]
 ]){const x=await before.read(q,route),y=await after.read(q,route);assert.equal(x.count,b,label+' before');assert.equal(y.count,a,label+' after');rows.push({label,before:x.count,after:y.count,saved:x.count-y.count})}
 for(const f of [before,after])await f.savedStream('movie',90000001,new Date(NOW).toISOString());
 for(const [label,delta,fail,b,a]of [['fresh providers',0,false,5,3],['due providers',86400000,false,8,8],['provider failure',2*86400000,true,9,9]]){
  for(const f of [before,after]){f.setNow(NOW+delta);f.setFail(fail)}const x=await before.read({id:'90000001'}),y=await after.read({id:'90000001'});assert.equal(x.count,b,label);assert.equal(y.count,a,label);rows.push({label,before:x.count,after:y.count,saved:x.count-y.count});
 }
 console.log('LOCAL_COMMAND_COMPARISON '+JSON.stringify(rows));
}));
local('lazy guard comparison against latest main; stored responses and misses create no writer tickets',()=>paused(async()=>{
 const {execFileSync}=require('node:child_process'),Module=require('node:module'),path=require('node:path');
 const filename=path.resolve(__dirname,'../api/_release-application.latest-main.js'),baseline=new Module(filename,module);baseline.filename=filename;baseline.paths=module.paths;
 baseline._compile(execFileSync('git',['show','de03bd5775328b09de8ff796c3425513e00f8b4c:api/_release-application.js'],{encoding:'utf8'}),filename);
 const before=await fixture(baseline.exports.application),after=await fixture(),rows=[];
 // Optional local-only nested-command measurement. Run alone: INFO is server-wide.
 // Exclude INFO and redis-cli connection metadata (HELLO / CLIENT).
 async function stats(){const raw=await native(['INFO','commandstats']);return [...raw.split('\n').filter(line=>!/^cmdstat_(?:client|info|hello)/.test(line)).join('\n').matchAll(/calls=(\d+)/g)].reduce((n,m)=>n+Number(m[1]),0)}
 async function measured(f,q,route){const start=process.env.LOCAL_COMMAND_STATS==='1'?await stats():null,result=await f.read(q,route);return {...result,includingLua:start===null?null:await stats()-start}}
 const cases=[['work',{},'work-detail',3,2],['fresh providers',{},'search',4,3],['SEO',{},'detail-page',5,4],['saved search',{query:'保存作品',type:'all'},'search',6,5],['missing work',{id:'99999999'},'search',3,2],['missing SEO',{id:'99999999'},'detail-page',4,3],['series',{series:'kimetsu'},'series-watch',3,2]];
 for(const f of [before,after])await f.savedStream('movie',90000001,new Date(NOW).toISOString());
 for(const [label,q,route,b,a]of cases){const query={id:'90000001',...q};if(q.query||q.series)delete query.id;const x=await measured(before,query,route),y=await measured(after,query,route);assert.equal(x.count,b,label);assert.equal(y.count,a,label);assert.equal(x.res.statusCode,y.res.statusCode,label);assert.deepEqual(x.res.value,y.res.value,label);noAcquisition(y.calls);assert(!y.calls.some(v=>v[0]==='HDEL'));rows.push({label,before:x.count,after:y.count,includingLuaBefore:x.includingLua,includingLuaAfter:y.includingLua})}
 console.log('LAZY_GUARD_MAIN_COMPARISON '+JSON.stringify(rows));
}));
local('full writer capacity does not block saved reads; due refresh cannot fetch without a ticket',()=>paused(async()=>{
 const f=await fixture(),now=NOW;await f.savedStream('movie',90000001,new Date(now).toISOString());
 await f.command(['HSET','doko:dev:cutover:v1:active',...Array.from({length:64},(_,i)=>['fixture-'+i,JSON.stringify({kind:'fixture',startedAt:now})]).flat()]);
 let r=await f.read({id:'90000001'});assert.equal(r.res.statusCode,200);assert.equal(r.count,3);noAcquisition(r.calls);
 f.setNow(now+86400000); // Keep the synthetic active tickets current, as real long work would.
 await f.command(['HSET','doko:dev:cutover:v1:active',...Array.from({length:64},(_,i)=>['fixture-'+i,JSON.stringify({kind:'fixture',startedAt:now+86400000})]).flat()]);
 r=await f.read({id:'90000001'});assert.equal(r.res.statusCode,200);assert.equal(r.fetches.length,0);assert.equal(r.res.value.streaming[0].logo_path,'/fixture.png');assert.equal(Number(await f.command(['HLEN','doko:dev:cutover:v1:active'])),64);
}));
