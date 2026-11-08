'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {command}=require('./helpers/local-redis'),{contentStore}=require('../api/_dev-content-store'),idx=require('../api/_search-index-v2'),{indexedSearch}=require('../api/_indexed-search'),{normalizeWorkV2}=require('../api/_work-ledger-v2-schema');
const local=(name,fn)=>test(name,{skip:!process.env.REDIS_TEST_CLI},fn);
local('1505 saved works index automatically, paginate without 1000 cap, and rename without stale results',async()=>{
 const store=contentStore(command),base=400000000+process.pid*2000,query='試験'+process.pid,works=Array.from({length:1505},(_,i)=>normalizeWorkV2('movie',base+i+1,{title:query+'作品'+i}));
 for(let i=0;i<works.length;i+=10)assert((await store.commit(works.slice(i,i+10).map(data=>({key:store.keys.work('movie',data.id),revision:0,data})))).saved);
 let cursor=null,ids=[],calls=[];const send=args=>{calls.push(args);return command(args)};
 do{const result=await indexedSearch(query,{kind:'work',type:'movie',page:1,cursor,command:send});ids.push(...result.results.map(r=>r.id));cursor=result.nextCursor}while(cursor);
 assert.equal(new Set(ids).size,1505);assert.equal(ids.length,1505);const reads=calls.filter(c=>c[0]==='EVAL'&&c[1]===require('../api/_indexed-search').READ);assert(reads.length);assert(reads.every(c=>Number(c[2])<=32));
 let rare=await indexedSearch(query+'作品1499',{kind:'work',type:'movie',page:1,command});assert(rare.scanned<=512);let attempts=1;while(!rare.results.length&&rare.nextCursor){rare=await indexedSearch(query+'作品1499',{kind:'work',type:'movie',page:1,cursor:rare.nextCursor,command});assert(rare.scanned<=512);attempts++}assert.equal(rare.results[0].id,works[1499].id);assert(attempts<=20);
 const work=works[0];assert((await store.commit([{key:store.keys.work('movie',work.id),revision:1,data:{...work,title:'改題'+process.pid}}])).saved);
 const result=await indexedSearch('改題'+process.pid,{kind:'work',type:'movie',page:1,command});assert.equal(result.results[0].id,work.id);
 const old=await command(['ZRANGEBYLEX',idx.PREFIX+'grams:work','['+Buffer.from('試験').toString('hex')+':','('+Buffer.from('試験').toString('hex')+';']);assert(!old.some(m=>m.endsWith('movie:'+work.id)));
});
local('person indexing and canonical checks reject stale ghost candidates and mismatched cursor',async()=>{
 const store=contentStore(command),id=500000000+process.pid,person=require('../prototype/person-ledger').store().success({id,name:'索引人物'+process.pid},'2026-11-09T00:00:00Z');assert((await store.commit([{key:store.keys.person(id),revision:0,data:person}])).saved);
 const result=await indexedSearch('索引人物'+process.pid,{kind:'person',type:'movie',page:1,command});assert.equal(result.results[0].id,id);
 const token=Buffer.from('幽霊').toString('hex');await command(['ZADD',idx.PREFIX+'grams:person','0',token+':'+id]);assert.equal((await indexedSearch('幽霊',{kind:'person',type:'movie',page:1,command})).results.length,0);
 await assert.rejects(indexedSearch('x',{kind:'person',type:'movie',page:1,cursor:Buffer.from(JSON.stringify({hash:'wrong',after:token+':1'})).toString('base64url'),command}),/cursor/);
});
test('hot grams stop at 512 candidates and an empty partial page can continue without claiming no match',async()=>{
 const members=Array.from({length:601},(_,i)=>'6162:movie:'+(9000000+i)),rows=new Map(members.map((m,i)=>['doko:dev:work:v2:movie:'+(9000000+i),normalizeWorkV2('movie',9000000+i,{title:i===600?'abcd':'abXXbcXXcd'})]));let maxBatch=0;
 const fake=async args=>{if(args[0]==='EVAL'&&args[1]===idx.SELECT)return '6162';if(args[0]==='EVAL'&&args[1]===require('../api/_indexed-search').READ){maxBatch=Math.max(maxBatch,Number(args[2]));return args.slice(3).map(k=>JSON.stringify(rows.get(k)))}if(args[0]==='ZRANGEBYLEX'){const start=args[2][0]==='('?members.indexOf(args[2].slice(1))+1:0;return members.slice(start,start+Number(args[6]))}if(args[0]==='MGET'){maxBatch=Math.max(maxBatch,args.length-1);return args.slice(1).map(k=>JSON.stringify(rows.get(k)))}throw Error('unexpected command')};
 const first=await indexedSearch('abcd',{kind:'work',type:'movie',page:1,command:fake});assert.equal(first.results.length,0);assert.equal(first.scanned,512);assert(first.incomplete&&first.hasMore&&first.nextCursor);const next=await indexedSearch('abcd',{kind:'work',type:'movie',page:1,cursor:first.nextCursor,command:fake});assert.equal(next.results[0].id,9000600);assert(maxBatch<=32);
});
local('1103 people save into the automatic index and paginate past 1000 without fetching credits/providers',async()=>{
 const store=contentStore(command),base=2000000000+process.pid*2000,query='一千超人物'+process.pid,records=Array.from({length:1103},(_,i)=>require('../prototype/person-ledger').store().success({id:base+i+1,name:query+' '+i,cast:[],voice:[],directed:[],documentary_talk:[],other:[]},'2026-11-09T00:00:00Z'));
 for(let i=0;i<records.length;i+=10)assert((await store.commit(records.slice(i,i+10).map(data=>({key:store.keys.person(data.person.id),revision:0,data})))).saved);
 let cursor=null,ids=[];do{const result=await indexedSearch(query,{kind:'person',type:'movie',page:1,cursor,command});ids.push(...result.results.map(r=>r.id));cursor=result.nextCursor}while(cursor);assert.equal(ids.length,1103);assert.equal(new Set(ids).size,1103);
 const first=records[0],updated={...first,person:{...first.person,name:'改名人物'+process.pid}};assert((await store.commit([{key:store.keys.person(first.person.id),revision:1,data:updated}])).saved);assert.equal((await indexedSearch('改名人物'+process.pid,{kind:'person',type:'movie',page:1,command})).results[0].id,first.person.id);
});
