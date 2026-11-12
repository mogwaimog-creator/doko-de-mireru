'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{command:native}=require('./helpers/local-redis');
function response(){return {statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.value=v;this.writableEnded=true;return this},end(v){this.value=v;this.writableEnded=true;return this}}}
test('release season route reuses fresh data, refreshes at the agreed cadence and preserves stale success on failure',async()=>{
 const transport=require('../api/_release-transport-candidate'),client=transport.createTransport({endpoint:'https://redis.invalid',token:'not-a-real-token-123456789',releaseSha256:require('node:crypto').randomBytes(32).toString('hex'),phase:'new',enabled:true,scripts:transport.coreScripts(),request:async(_url,options)=>new Response(JSON.stringify({result:await native(JSON.parse(options.body))}))}),command=require('../api/_release-connection').bind(client);
 await command(['SET','doko:dev:content-control:v1','{"status":"ready"}']);
 const raw={id:85937,name:'Season fixture',first_air_date:'2019-04-06',genres:[],credits:{cast:[],crew:[]},status:'Returning Series',seasons:[{season_number:1,name:'First',episode_count:1,air_date:'2019-04-06'}]};
 let now=Date.parse('2026-11-10T00:00:00Z'),workLoads=0,episodeLoads=0,fail=false;
 const app=require('../api/_release-application').application({command,config:{},clock:()=>now,source:async route=>{if(route==='/3/tv/85937'){workLoads++;return raw}assert.equal(route,'/3/tv/85937/season/1');episodeLoads++;if(fail)throw Error('isolated season failure');return {id:1,season_number:1,episodes:[{episode_number:1,name:'Episode version '+episodeLoads,air_date:'2019-04-06',runtime:24}]}}});
 const read=async()=>{const res=response();await app.handle('search',{method:'GET',headers:{},query:{id:'85937',type:'tv',season:'1'}},res);assert.equal(res.statusCode,200);return res.value};
 assert.equal((await read()).episodes[0].name,'Episode version 1');assert.equal(workLoads,1);assert.equal(episodeLoads,1);
 now+=7*86400000-1;assert.equal((await read()).episodes[0].name,'Episode version 1');assert.equal(episodeLoads,1);
 now++;assert.equal((await read()).episodes[0].name,'Episode version 2');assert.equal(workLoads,1);assert.equal(episodeLoads,2);
 now+=7*86400000;fail=true;assert.equal((await read()).episodes[0].name,'Episode version 2');assert.equal(episodeLoads,3);
 assert.equal((await read()).episodes[0].name,'Episode version 2');assert.equal(episodeLoads,3,'cooldown prevents repeated failing acquisition');assert.equal(workLoads,1,'saved TV metadata must never be fetched for episode refresh');
 const saved=JSON.parse(await command(['GET','doko:dev:season:v1:tv:85937']));assert.equal(saved.refreshDays,7);assert.equal(saved.seasons[0].episodesCheckedAt,'2026-11-17T00:00:00.000Z');
});
