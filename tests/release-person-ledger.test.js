'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {command:native}=require('./helpers/local-redis');
function response(){return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(v){this.value=v;this.writableEnded=true;return this},end(v){this.value=v;this.writableEnded=true;return this}}}
test('release person route persists canonical credits, reuses across processes, and preserves stale success on failure',async()=>{
 const transport=require('../api/_release-transport-candidate'),client=transport.createTransport({endpoint:'https://redis.invalid',token:'not-a-real-token-123456789',releaseSha256:require('node:crypto').randomBytes(32).toString('hex'),phase:'new',enabled:true,role:'application',scripts:transport.coreScripts(),request:async(_url,options)=>new Response(JSON.stringify({result:await native(JSON.parse(options.body))}))});
 const command=require('../api/_release-connection').bind(client),key='doko:dev:person:v2:1813';
 await command(['SET','doko:dev:content-control:v1','{"status":"ready"}']);
 let now=Date.parse('2026-11-10T00:00:00Z'),calls=0,fail=false;
 const source=async path=>{calls++;if(fail)throw Error('isolated upstream outage');return path.endsWith('/combined_credits')?{id:1813,cast:[{id:635302,media_type:'movie',title:'Fixture film',character:'Actor',release_date:'2020-10-16'},{id:85937,media_type:'tv',name:'Fixture TV',character:'Voice (voice)',first_air_date:'2019-04-06'}],crew:[]}:{id:1813,name:'Fixture person'}};
 const make=()=>require('../api/_release-application').application({command,config:{},source,clock:()=>now});
 async function read(app,id='1813'){const res=response();await app.handle('search',{method:'GET',headers:{},query:{personId:id}},res);return res}
 const first=await read(make());assert.equal(first.statusCode,200);assert.equal(calls,2);assert.equal(first.value.cast[0].media_type,'movie');assert.equal(first.value.voice[0].media_type,'tv');
 const stored=JSON.parse(await command(['GET',key]));require('../prototype/person-ledger').validateRecord(stored);assert.deepEqual(stored.person,first.value);
 fail=true;const warm=await read(make());assert.equal(warm.statusCode,200);assert.deepEqual(warm.value,first.value);assert.equal(calls,2,'new application must read durable person ledger');
 now+=61*86400000;const stale=await read(make());assert.equal(stale.statusCode,200);assert.deepEqual(stale.value,first.value);assert.equal(calls,3);assert.equal(JSON.parse(await command(['GET',key])).checkedAt,stored.checkedAt);
 const cooled=await read(make());assert.equal(cooled.statusCode,200);assert.equal(calls,3,'failed refresh must respect cooldown');
 const missing=await read(make(),'1814');assert.equal(missing.statusCode,503);assert.equal(await command(['GET','doko:dev:person:v2:1814']),null);assert.equal(missing.headers['X-Robots-Tag'],'noindex');
});
