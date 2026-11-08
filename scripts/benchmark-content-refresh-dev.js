'use strict';
const {command}=require('../tests/helpers/local-redis'),{contentStore}=require('../api/_dev-content-store'),{coordinator}=require('../api/_content-ledger-coordinator');
const names=['get','set','mget','eval','pttl','del','mset','exists','type','zadd','zrem'];
async function stats(){const raw=await command(['INFO','commandstats']);return Object.fromEntries(names.map(k=>[k,Number(raw.match(new RegExp('cmdstat_'+k+':calls=(\\d+)'))?.[1]||0)]))}
async function benchmark(){const results={};for(const guarded of [true,false]){
 let rpcs=0,loads=0;const id=700000000+process.pid*10+(guarded?1:2),send=args=>{rpcs++;return command(args)},store=contentStore(send,{controlKey:'doko:dev:benchmark-control:'+id}),before=await stats();
 const result=await coordinator(store,{guarded}).person(id,async()=>{loads++;return {id,name:'isolated person fixture',cast:[],voice:[],directed:[],documentary_talk:[],other:[]}},'2026-11-09T00:00:00Z');const after=await stats(),commands=Object.fromEntries(names.map(k=>[k,after[k]-before[k]])),operations=Object.values(commands).reduce((a,b)=>a+b,0);
 if(result.status!=='saved'||loads!==1||rpcs!==(guarded?2:4)||operations!==(guarded?10:18))throw Error('incomplete or contaminated content benchmark '+JSON.stringify({result,rpcs,operations}));results[guarded?'beforeCASOnly':'fencedWithSharedStop']={clientRedisRPCs:rpcs,redisOperationsIncludingLua:operations,upstreamFixtureLoads:loads,commands};
 }return {scope:'one new person, local Redis 7.2.6 only; no upstream calls',results,billing:'Does not establish Upstash billable counts. Public cached reads do not take this update lease.'}}
if(require.main===module)benchmark().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});module.exports={benchmark};
