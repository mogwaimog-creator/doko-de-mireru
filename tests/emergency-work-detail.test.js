'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomBytes}=require('node:crypto');
const {command:native}=require('./helpers/local-redis');
const transport=require('../api/_release-transport-candidate');
const response=()=>({statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.value=v;this.writableEnded=true;return this},end(v){this.value=v;this.writableEnded=true;return this}});
async function paused(fn){const names=['NON_STREAMING_ACQUISITION_PAUSED','TMDB_API_KEY'],old=names.map(k=>process.env[k]),fetchBefore=global.fetch;process.env.NON_STREAMING_ACQUISITION_PAUSED='1';process.env.TMDB_API_KEY='mock';global.fetch=()=>{throw Error('External network forbidden')};try{await fn()}finally{global.fetch=fetchBefore;names.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i])}}
async function fixture(){
 const calls=[],fetches=[];let failure=null,now=Date.parse('2026-11-14T00:00:00Z');
 const client=transport.createTransport({endpoint:'https://redis.invalid',token:'isolated-emergency-test-token',releaseSha256:randomBytes(32).toString('hex'),phase:'new',enabled:true,scripts:transport.coreScripts(),request:async(_url,options)=>{const a=JSON.parse(options.body);calls.push(a);return new Response(JSON.stringify({result:await native(a)}))}});
 const command=require('../api/_release-connection').bind(client);
 await command(['SET','doko:dev:content-control:v1','{"status":"ready","newWorkAcquisitionPaused":true}']);
 const guard=require('../api/_acquisition-guard').session(command,{clock:()=>now});
 const load=require('../api/_release-source').source({command,guard,clock:()=>now,apiKey:'mock',dailyLimit:100,request:async url=>{const path=new URL(url).pathname;fetches.push(path);if(failure==='network')throw Error('Mock TMDB outage');if(failure==='oversize')return new Response('x'.repeat(1048577));if(typeof failure==='number')return new Response('{}',{status:failure});const [, ,type,id]=path.split('/');return new Response(JSON.stringify({id:failure==='identity'?999:Number(id),title:failure==='title'?'':'未登録映画',name:failure==='title'?'':'未登録ドラマ','watch/providers':{results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix'}],rent:[],buy:[]}}},overview:'TMDB由来の概要',runtime:120,release_date:'2026-11-01',first_air_date:'2026-10-01',poster_path:'/fixture.jpg',genres:[{id:28,name:'アクション'}],credits:{cast:[{id:123,name:'出演者'}],crew:[{id:124,name:'監督',job:'Director'}]},seasons:type==='tv'?[{season_number:1,name:'第1シーズン',episode_count:8}]:undefined}))}});
 const app=require('../api/_release-application').application({command,guard,source:load,clock:()=>now,config:{cronSecret:'mock'}});
 return {command,guard,load,client,fail:v=>failure=v,setNow:v=>now=v,async read(type,id,route='search'){calls.length=0;fetches.length=0;const res=response();await app.handle(route,{method:'GET',query:{type,id:String(id)},headers:{}},res);return {res,calls:[...calls],fetches:[...fetches]}}};
}
function noWrites(calls){assert(calls.every(a=>a[0]==='GET'||(a[0]==='EVAL'&&a[1]===require('../api/_recovery-initial-seo').PROJECT)),'display-only must never mutate Redis')}
const local=(name,fn)=>test(name,{skip:!process.env.REDIS_TEST_CLI},()=>paused(fn));
local('missing movie and TV render JSON, work API and SEO repeatedly without Redis writes',async()=>{
 const f=await fixture(),counts=[];
 for(const type of ['movie','tv'])for(let repeat=0;repeat<2;repeat++)for(const route of ['search','work-detail','detail-page']){
  const id=type==='movie'?91000001:91000002,r=await f.read(type,id,route);assert.equal(r.res.statusCode,200,route);noWrites(r.calls);assert.deepEqual(r.fetches,['/3/'+type+'/'+id]);
  if(route==='search'){assert.equal(r.res.value.id,id);assert.match(r.res.value.title,/未登録/);assert.equal(r.res.value.ledgerManaged,false);assert.equal(r.res.value.streaming[0].name,'Netflix');assert.equal(r.res.value.streamingMeta.source,'tmdb-transient');assert.equal(r.res.value.cast[0].name,'出演者');if(type==='tv'){assert.equal(r.res.value.seasons[0].season_number,1);assert.equal(r.res.value.number_of_episodes,8)}}
  else if(route==='work-detail'){assert.equal(r.res.value.source,'tmdb');assert.match(r.res.value.work.title,/未登録/)}
  else {assert.match(r.res.value,/<title>[^<]*未登録/);assert.match(r.res.value,/<h1[^>]*>未登録/);assert.match(r.res.value,/application\/ld\+json/);assert.match(r.res.value,/rel="canonical"/);assert.match(r.res.value,/TMDB由来の概要/)}
  counts.push({type,route,redis:r.calls.length,tmdb:r.fetches.length});
  for(const k of ['work:v2:'+type+':'+id,'seo:v1:'+type+':'+id,'season:v1:tv:'+id,'shared-stream:v1:record:'+type+':'+id])assert.equal(await f.command(['GET','doko:dev:'+k]),null);
 }
 console.log('EMERGENCY_DETAIL_COUNTS '+JSON.stringify(counts.slice(0,6)));
});
local('saved locked metadata wins over TMDB; original record remains byte identical',async()=>{
 const f=await fixture(),work=require('../api/_work-ledger-v2-schema').normalizeWorkV2('movie',91000003,{title:'手動固定タイトル',overview:'手動の概要',lockedFields:['title','overview']});
 const raw=JSON.stringify(work),key='doko:dev:work:v2:movie:91000003';await f.command(['SET',key,raw]);
 // Roster member avoids visit refresh, just as the existing production rules specify.
 const roster=require('../scripts/lib/cutover/package').roster[0];const saved={...work,type:roster.type,id:roster.id};await f.command(['SET','doko:dev:work:v2:'+roster.type+':'+roster.id,JSON.stringify(saved)]);
 for(const route of ['search','work-detail','detail-page']){const r=await f.read(roster.type,roster.id,route);assert.equal(r.res.statusCode,200);assert.equal(r.fetches.length,0);noWrites(r.calls);assert(JSON.stringify(r.res.value).includes('手動固定タイトル'))}
 assert.equal(await f.command(['GET',key]),raw);
});
local('TMDB failure, invalid identity/title and oversized payload never save; 404 HTML has noindex',async()=>{
 const f=await fixture();for(const mode of ['network',503,404,'identity','title','oversize']){f.fail(mode);for(const route of ['search','detail-page']){const r=await f.read('movie',91000004,route);assert.equal(r.res.statusCode,mode===404&&route==='detail-page'?404:503);assert.equal(r.res.headers['X-Robots-Tag'],'noindex');noWrites(r.calls);assert.equal(r.fetches.length,1)}}
});
local('display-only bypass is restricted; shared operator pause and invalid IDs still fail closed',async()=>{
 const f=await fixture();for(const path of ['/3/person/123','/3/tv/123/season/1','/3/movie/123/watch/providers','/3/search/movie'])await assert.rejects(f.load(path,{},undefined,{displayOnly:true}),/display-only/);
 for(const id of ['bad','0','-1']){const r=await f.read('movie',id);assert.notEqual(r.res.statusCode,200);assert.equal(r.fetches.length,0);noWrites(r.calls)}
 await f.command(['SET','doko:dev:content-control:v1','{"status":"paused"}']);const r=await f.read('movie',91000005);assert.equal(r.res.statusCode,503);assert.equal(r.fetches.length,0);noWrites(r.calls);
});
local('after acquisition pause is lifted the original ingest writes canonical work, SEO and index',async()=>{
 const f=await fixture();delete process.env.NON_STREAMING_ACQUISITION_PAUSED;
 await f.command(['SET','doko:dev:content-control:v1','{"status":"ready","newWorkDailyLimit":100}']);
 // application snapshots the emergency policy, but each use also checks the live pause flag.
 const r=await f.read('movie',91000006,'work-detail');assert.equal(r.res.statusCode,200);assert.equal(r.res.value.source,'ledger');assert(r.calls.some(a=>a[0]==='EVAL'&&a[1]===require('../api/_dev-content-store').COMMIT));assert(await f.command(['GET','doko:dev:work:v2:movie:91000006']));assert(await f.command(['GET','doko:dev:seo:v1:movie:91000006']));
});
