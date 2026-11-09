'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {createHandler}=require('../api/detail-page'),{metadataUrl,readWork}=require('../api/_recovery-fixed-work');
const {command}=require('./helpers/local-redis'),recovery=require('../api/_recovery-fetch-cache');
const template=()=>fs.readFileSync(require('node:path').join(__dirname,'../detail.html'),'utf8');
function response(){return {headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},end(body){this.body=body;return this}}}
async function run(handler,id='123',type='movie',method='GET'){const res=response();await handler({method,query:{id,type}},res);return res}
test('initial HTML contains escaped general movie/TV SEO without running JS',async()=>{
 for(const type of ['movie','tv']){const handler=createHandler({active:()=>true,template,readFixed:async()=>({id:123,title:'作品 $& <script>unsafe</script>',overview:'紹介 " & <b>説明</b>',release_date:'2020-01-01',poster_path:'/poster.jpg'})});const res=await run(handler,'123',type);assert.equal(res.code,200);assert(res.body.includes('data-seo-ledger="1"'));assert(res.body.includes('<h1 id="title">作品 $&amp; unsafe</h1>'));assert(res.body.includes('https://image.tmdb.org/t/p/w780/poster.jpg'));assert(res.body.includes(type==='tv'?'detail.html?id=123&amp;type=tv':'detail.html?id=123"'));assert(!res.body.includes('<script>unsafe</script>'));assert.equal(res.headers['Cache-Control'],'private, no-store')}
});
test('invalid identity, not found, pause/outage, HEAD, production guard fail safely',async()=>{
 let loads=0;const handler=createHandler({active:()=>true,template,readFixed:async()=>{loads++;throw Object.assign(Error('missing'),{httpStatus:404})}});assert.equal((await run(handler,'0')).code,400);assert.equal(loads,0);assert.equal((await run(handler)).code,404);
 const failed=await run(createHandler({active:()=>true,template,readFixed:async()=>{throw Error('paused')}}));assert.equal(failed.code,503);assert.equal(failed.headers['X-Robots-Tag'],'noindex');assert.equal(failed.headers['Retry-After'],'5');
 const head=await run(createHandler({active:()=>true,template,readFixed:async()=>({id:123,title:'head'})}),'123','movie','HEAD');assert.equal(head.code,200);assert.equal(head.body,'');assert.equal((await run(createHandler({active:()=>false}))).code,404);
 const old={...process.env};try{process.env.DEV_LEAN_SERIES_ENABLED='1';process.env.DEV_DETAIL_HTML_ENABLED='1';process.env.NODE_ENV='production';assert.equal(require('../api/detail-page').enabled(),false)}finally{process.env=old}
});
function local(name,fn){test(name,{skip:!process.env.REDIS_TEST_CLI},async()=>{const prefix=`doko:dev:initial-html:${process.pid}:${Date.now()}:${Math.random().toString(16).slice(2)}:`,send=args=>command(args.map(x=>typeof x==='string'?x.replace(/^doko:dev:recovery:v1:/,prefix+'cache:').replace(/^doko:dev:work:v2:/,prefix+'work:').replace(/^doko:dev:seo:v1:/,prefix+'seo:').replace(/^doko:dev:season:v1:/,prefix+'season:').replace(/^doko:dev:acquisition:v1:/,prefix+'acquisition:').replace(/^doko:dev:search:v2:/,prefix+'index:').replace(/^doko:dev:content-control:v1$/,prefix+'control'):x));await fn({prefix,send})})}
local('cold HTML and later JSON detail share one metadata fetch; no provider fetch/write',async({prefix,send})=>{
 let calls=0;const old={...process.env};process.env.TMDB_API_KEY='local-fixture';
 try{process.env.DEV_CONTENT_LEDGER_ENABLED='1';const fixed=(t,i,o)=>readWork(t,i,{...o,command:send}),handler=createHandler({active:()=>true,template,readFixed:fixed,cacheCommand:send,fetchMetadata:async url=>{calls++;assert(!url.includes('watch/providers'));return {ok:true,json:async()=>({id:321,title:'未登録の一般作品',overview:'説明',release_date:'2021-01-01',poster_path:'/test.jpg',credits:{cast:[],crew:[]}})}}});
 const first=await run(handler,'321');assert.equal(first.code,200);assert(first.body.includes('未登録の一般作品'));assert.equal(calls,1);assert.equal((await run(handler,'321')).code,200);assert.equal(calls,1);
 const api=await readWork('movie',321,{command:send,load:()=>recovery.cache(send).load(metadataUrl('movie',321,'other-fixture-key'),()=>{throw Error('cache should be reused')})});assert.equal(api.title,'未登録の一般作品');assert.equal(calls,1);assert.equal(await command(['EXISTS',prefix+'work:movie:321']),1);const saved=JSON.parse(await command(['GET',prefix+'work:movie:321']));assert.equal(saved.schemaVersion,2);assert(!Object.hasOwn(saved,'credits'));assert(!Object.hasOwn(saved,'watch/providers'));
 }finally{process.env=old}
});
local('existing manual locked work overrides cached upstream and never falls through on corruption',async({prefix,send})=>{
 const manual={schemaVersion:2,type:'movie',id:321,title:'手動確認済み',overview:'手動紹介',posterPath:'/manual.jpg',cast:Array.from({length:30},(_,id)=>({id:id+1,name:'出演者'})),lockedFields:['title','cast'],confirmed:true,locked:true,pageExtras:{privateNote:'非公開'}};
 await command(['SET',prefix+'work:movie:321',JSON.stringify(manual)]);const before=await command(['GET',prefix+'work:movie:321']);const old={...process.env};
 try{process.env.DEV_CONTENT_LEDGER_ENABLED='1';delete process.env.NODE_ENV;delete process.env.VERCEL_ENV;
 const handler=createHandler({active:()=>true,template,readFixed:(t,i,o)=>readWork(t,i,{...o,command:send}),cacheCommand:send,fetchMetadata:async()=>{throw Error('must not fetch')}});
 const res=await run(handler,'321');assert.equal(res.code,200);assert(res.body.includes('手動確認済み'));assert(!res.body.includes('非公開'));assert.equal(await command(['GET',prefix+'work:movie:321']),before);
 await command(['SET',prefix+'work:movie:321','{"schemaVersion":2,"id":999}']);assert.equal((await run(handler,'321')).code,503);
 }finally{process.env=old}
});
local('wrong upstream work ID is not rendered or cached',async({send})=>{
 const old={...process.env};process.env.TMDB_API_KEY='fixture';try{const handler=createHandler({active:()=>true,template,cacheCommand:send,readFixed:(t,i,o)=>readWork(t,i,{...o,command:send}),fetchMetadata:async()=>({ok:true,json:async()=>({id:999,title:'wrong'})})});assert.equal((await run(handler,'321')).code,503)}finally{process.env=old}
});
local('review of a title preserves full cast, multiple directors, unknown extensions and field locks',async({prefix})=>{
 const {contentStore}=require('../api/_dev-content-store'),{admin}=require('../api/_ledger-admin-dev'),{createSeoRecord}=require('../prototype/seo-ledger');const id=70000000+Math.floor(Math.random()*1000000),store=contentStore(command,{controlKey:prefix+'control'}),ops=admin(command,{controlKey:prefix+'control'}),wk=store.keys.work('movie',id),sk=store.keys.seo('movie',id);
 const work={schemaVersion:2,type:'movie',id,title:'before',cast:Array.from({length:30},(_,n)=>({id:n+1,name:'actor '+n,character:'role'})),directors:[{id:1,name:'one'},{id:2,name:'two'}],lockedFields:['cast'],pageExtras:{manual:'original'},customAward:{text:'protected'},confirmed:true,locked:true};await store.commit([{key:wk,revision:0,data:work},{key:sk,revision:0,data:createSeoRecord(work)}]);
 assert((await ops.editWork('movie',id,{revision:1,patch:{title:'after'},reason:'title reviewed'})).saved);const saved=JSON.parse(await command(['GET',wk]));for(const field of ['cast','directors','lockedFields','pageExtras','customAward'])assert.deepEqual(saved[field],work[field],field);assert.equal(saved.title,'after');
});
local('warm initial HTML reads only a small projection and reflects later manual title/lock edits',async({prefix,send})=>{
 const {projectSeo}=require('../api/_recovery-initial-seo');let loads=0,responseBytes=0;const tracked=async args=>{const result=await send(args);responseBytes+=Buffer.byteLength(JSON.stringify(result));return result};const old={...process.env};process.env.TMDB_API_KEY='fixture';
 try{const handler=createHandler({active:()=>true,template,readFixed:(t,i,o)=>readWork(t,i,{...o,command:send}),cacheCommand:tracked,project:projectSeo,fetchMetadata:async()=>{loads++;return {ok:true,json:async()=>({id:321,title:'一般作品',overview:'説明',poster_path:'/test.jpg',credits:{cast:Array.from({length:150},(_,id)=>({id,name:'出演者'.repeat(30)})),crew:[]}})}}});assert.equal((await run(handler,'321')).code,200);responseBytes=0;assert.equal((await run(handler,'321')).code,200);assert(responseBytes<1024);assert.equal(loads,1);
 await command(['SET',prefix+'work:movie:321',JSON.stringify({schemaVersion:2,type:'movie',id:321,title:'手動の新しい題名',shortIntro:'手動の紹介文も保護',locked:true,lockedFields:['title'],cast:[],pageExtras:{private:'secret'}})]);const res=await run(handler,'321');assert.equal(res.code,200);assert(res.body.includes('手動の新しい題名'));assert(res.body.includes('手動の紹介文も保護'));assert(!res.body.includes('secret'));assert.equal(loads,1);
 }finally{process.env=old}
});
