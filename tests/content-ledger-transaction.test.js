'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {command}=require('./helpers/local-redis');
const {contentStore,digest}=require('../api/_dev-content-store');
const {coordinator}=require('../api/_content-ledger-coordinator');
const at='2026-01-01T00:00:00Z',later='2026-04-02T00:00:00Z';
let sequence=0;
function local(name,fn){test(name,{skip:!process.env.REDIS_TEST_CLI},async()=>{const id=800000000+process.pid*100+(sequence+=10);await fn(contentStore(command),id)})}
local('work and SEO publish one CAS generation; stale contender cannot publish either',async(store,id)=>{
 const c=coordinator(store);assert.equal((await c.work('movie',id,async()=>({id,title:'manual',cast:[]}),at)).status,'saved');
 const wk=store.keys.work('movie',id),sk=store.keys.seo('movie',id),snap=await store.read([wk,sk]);assert.equal(snap[sk].meta.sourceDigest,digest(snap[wk].data));
 const entries=Object.entries(snap).map(([key,v])=>({key,data:v.data,revision:v.meta.revision,meta:v.meta}));assert((await store.commit(entries)).saved);assert.equal((await store.commit(entries)).reason,'version-conflict');
 const fresh=await store.read([wk,sk]);assert.equal(fresh[wk].meta.revision,fresh[sk].meta.revision);assert(!Object.hasOwn(fresh[wk].data,'revision'));
});
local('confirmed work, field locks, editorial notes and unresolved errors survive automatic ingestion',async(store,id)=>{
 const c=coordinator(store);await c.work('movie',id,async()=>({id,title:'manual',lockedFields:['title'],pageExtras:{guide:{note:'preserve'}}}),at);
 await c.work('movie',id,async()=>({id,title:'upstream',overview:'updated'}),later,{force:true});let v=(await store.read([store.keys.work('movie',id)]))[store.keys.work('movie',id)];assert.equal(v.data.title,'manual');assert.equal(v.data.pageExtras.guide.note,'preserve');
 const bad={...v.data,title:'overwrite'};assert.equal((await store.commit([{key:store.keys.work('movie',id),data:bad,revision:v.meta.revision}])).reason,'locked-field');
 assert((await c.confirmWork('movie',id,later)).saved);await c.work('movie',id,async()=>({id,title:'bad',overview:'bad'}),later,{force:true});v=(await store.read([store.keys.work('movie',id)]))[store.keys.work('movie',id)];assert.equal(v.data.overview,'updated');assert(v.data.locked);
 const next=id+1;await c.work('movie',next,async()=>({id:next,title:'error',errors:[{status:'open'}]}),at);await assert.rejects(c.confirmWork('movie',next,later),/unresolved/);
});
local('person refresh caches for 60 days, preserves creation, and retains credits on failure with cooldown',async(store,id)=>{
 const c=coordinator(store);let calls=0;const load=async()=>{calls++;return {id,name:'person',cast:[{id:635302,media_type:'movie',title:'無限列車編'}],voice:[],directed:[],documentary_talk:[],other:[]}};
 assert.equal((await c.person(id,load,at)).status,'saved');assert.equal((await c.person(id,load,'2026-01-20T00:00:00Z')).status,'cached');assert.equal(calls,1);
 const bad=await c.person(id,async()=>({...await load(),cast:[]}),later);assert.equal(bad.status,'stale-error');assert.equal(bad.record.person.cast.length,1);
 assert.equal((await c.person(id,load,'2026-04-02T00:01:00Z')).status,'cooldown');assert.equal((await c.person(id,load,'2026-04-02T00:31:00Z')).status,'saved');
 const v=(await store.read([store.keys.person(id)]))[store.keys.person(id)];assert.equal(v.data.createdAt,at.replace('Z','.000Z'));assert.equal((await c.person(id,load,at)).status,'clock-behind');
});
local('season manifest and lazy episodes share one consistent record and preserve episodes on manifest refresh',async(store,id)=>{
 const c=coordinator(store);const load=async()=>({tvId:id,seasons:[{seasonNumber:1,name:'first',episodeCount:2}]});assert.equal((await c.seasons(id,load,at)).status,'saved');
 const episodes=async()=>({tvId:id,seasonNumber:1,episodes:[{episodeNumber:1,name:'one'},{episodeNumber:2,name:'two'}]});let v=await c.episode(id,1,episodes,at);assert.equal(v.status,'saved');assert.equal(v.record.seasons[0].episodes.length,2);
 assert.equal((await c.episode(id,1,async()=>{throw Error('must not load')},'2026-01-02T00:00:00Z')).status,'cached');
 v=await c.seasons(id,load,later,{status:'Ended'});assert.equal(v.record.refreshDays,90);assert.equal(v.record.seasons[0].episodes.length,2);assert.equal(v.record.createdAt,at.replace('Z','.000Z'));
 const bad=await c.episode(id,1,async()=>({tvId:id,seasonNumber:1,episodes:[]}),later);assert.equal(bad.status,'stale-error');assert.equal(bad.record.seasons[0].episodes.length,2);
});
local('invalid identity and oversized bundles never replace prior work or SEO',async(store,id)=>{
 const c=coordinator(store);await c.work('movie',id,async()=>({id,title:'safe'}),at);const old=await store.read([store.keys.work('movie',id),store.keys.seo('movie',id)]);
 assert.equal((await c.work('movie',id,async()=>({id:id+1,title:'wrong'}),later,{force:true})).status,'stale-error');
 const v=old[store.keys.work('movie',id)];await assert.rejects(store.commit([{key:store.keys.work('movie',id),revision:v.meta.revision,data:{...v.data,overview:'x'.repeat(1100000)}}]),/too large/);
 const current=await store.read([store.keys.work('movie',id),store.keys.seo('movie',id)]);assert.deepEqual(current[store.keys.work('movie',id)].data,v.data);assert.deepEqual(current[store.keys.seo('movie',id)].data,old[store.keys.seo('movie',id)].data);
});
test('legacy compatibility enriches only matching IDs while compact titles remain authoritative',()=>{
 const {enrich}=require('../api/_work-v2-legacy-compat'),{toBasicTmdbDetail}=require('../api/_work-v2-detail-adapter'),{normalizeWorkV2}=require('../api/_work-ledger-v2-schema');
 const work=normalizeWorkV2('movie',635302,{title:'手動題名',cast:[{id:1813,name:'人物'}],genres:['アニメーション']});const old={schemaVersion:1,type:'movie',id:635302,extensions:{tmdbDetail:{id:635302,title:'旧題名',genres:[{id:16,name:'アニメーション'}],credits:{cast:[{id:1813,character:'役名',profile_path:'/portrait.jpg'}]}}}};
 const v=enrich(toBasicTmdbDetail(work),work,old);assert.equal(v.title,'手動題名');assert.equal(v.genres[0].id,16);assert.equal(v.cast[0].character,'役名');assert.equal(v.cast[0].profile_path,'/portrait.jpg');assert.throws(()=>enrich(toBasicTmdbDetail(work),work,{...old,type:'tv'}),/identity/);
});
local('v1 import preserves confirmed metadata, full compatibility copy and separate TV manifest atomically',async(store,id)=>{
 const {importWork}=require('../api/_content-ledger-import');
 const source={schemaVersion:1,type:'tv',id,title:'手動TV題名',genres:[{id:16,name:'アニメーション'}],cast:[{id:1813,name:'人物'}],editorial:{confirmed:true},pageExtras:{guide:{note:'manual'}},relatedWorkIds:[],seasons:[{seasonNumber:1,name:'first',episodeCount:12}],extensions:{tmdbDetail:{id,name:'旧題名',genres:[{id:16,name:'アニメーション'}],credits:{cast:[{id:1813,name:'人物',character:'役',profile_path:'/p.jpg'}]},'watch/providers':{results:{JP:{flatrate:[]}}}}}};
 assert((await importWork(store,source,at)).saved);const snapshot=await store.read([store.keys.work('tv',id),store.keys.seo('tv',id),store.keys.season(id),`doko:dev:legacy-work:v1:tv:${id}`]);const work=snapshot[store.keys.work('tv',id)].data;assert(work.confirmed&&work.locked);assert(!Object.hasOwn(work,'seasons'));assert.equal(snapshot[store.keys.season(id)].data.seasons[0].episodeCount,12);assert(!Object.hasOwn(snapshot[`doko:dev:legacy-work:v1:tv:${id}`].data.extensions.tmdbDetail,'watch/providers'));assert(source.extensions.tmdbDetail['watch/providers']);
 assert.equal((await importWork(store,{...source,title:'overwrite'},later)).reason,'existing-content-preserved');
 const prev={...process.env};try{process.env.DEV_CONTENT_LEDGER_ENABLED='1';delete process.env.NODE_ENV;delete process.env.VERCEL_ENV;const detail=await require('../api/_dev-content-ledgers').readWork('tv',id,{command});assert.equal(detail.name,'手動TV題名');assert.equal(detail.cast[0].character,'役');assert.equal(detail.number_of_episodes,12)}finally{process.env=prev}
});
local('content backup round-trip retains data, metadata revisions and editorial locks in a separate namespace',async(store,id)=>{
 const c=coordinator(store);await c.work('movie',id,async()=>({id,title:'backup',pageExtras:{guide:{note:'keep'}}}),at);await c.confirmWork('movie',id,at);
 await c.person(id,async()=>({id,name:'person',cast:[],voice:[],directed:[],documentary_talk:[],other:[]}),at);await c.seasons(id,async()=>({tvId:id,seasons:[{seasonNumber:1,name:'season',episodeCount:1}]}),at);
 const names=[store.keys.work('movie',id),store.keys.seo('movie',id),store.keys.person(id),store.keys.season(id)].flatMap(k=>[k,k+':meta']);const original=await command(['MGET',...names]);assert(original.every(Boolean));
 const backup=JSON.stringify(names.map((key,i)=>({key,value:original[i]}))),restored=JSON.parse(backup);const prefix=`doko:dev:content-restore:${id}:`;
 await command(['MSET',...restored.flatMap(r=>[prefix+r.key,r.value])]);assert.deepEqual(await command(['MGET',...restored.map(r=>prefix+r.key)]),original);assert.deepEqual(await command(['MGET',...names]),original);
});
test('v1 field-lock aliases protect director and rating after compact migration',()=>{
 const {normalizeWorkV2,acceptAutomaticUpdate}=require('../api/_work-ledger-v2-schema');
 const old=normalizeWorkV2('movie',635302,{title:'locked',directors:[{id:1,name:'manual'}],voteAverage:8,editorial:{locks:{directors:true,voteAverage:true}}});assert.deepEqual(old.lockedFields,['director','rating']);
 const next=acceptAutomaticUpdate(old,normalizeWorkV2('movie',635302,{title:'new',director:{id:2,name:'upstream'},rating:2}));assert.equal(next.director.id,1);assert.equal(next.rating,8);
});
