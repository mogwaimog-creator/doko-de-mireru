'use strict';
// Actual loopback Redis only. Compares identical safety policy and work IDs.
const {command}=require('../tests/helpers/local-redis');
const {sharedStore}=require('../api/_shared-streaming-store');
const {service}=require('../prototype/streaming-ledger-service');
const {inventory}=require('./audit-shared-ledgers');
async function stats(){const text=await command(['INFO','commandstats']);return Object.fromEntries(['get','set','mget','eval','pttl','del'].map(k=>[k,Number(text.match(new RegExp('cmdstat_'+k+':calls=(\\d+)'))?.[1]||0)]))}
async function benchmark(){
 const works=inventory().records.map(r=>({type:r.type,id:r.id,memberships:r.memberships})),results={};
 for(const optimized of [false,true]){
  let rpcs=0,loads=0,requestArgumentBytes=0;const before=await stats();
  const db=sharedStore(async args=>{rpcs++;requestArgumentBytes+=args.reduce((n,v)=>n+Buffer.byteLength(String(v)),0);return command(args)},{prefix:`doko:dev:benchmark:${Date.now()}:${optimized?'new':'old'}:`});
  const selected=optimized?db:Object.fromEntries(['read','acquire','saveIfOwner','release'].map(k=>[k,db[k]]));
  const started=Date.now();const engine=service(selected,async()=>{loads++;return {results:{JP:{flatrate:[],rent:[],buy:[]}}}},{cronBudgetMs:120000});
  const outcome=await engine.cron('2026-11-09T21:00:00Z',works);const elapsedMs=Date.now()-started;
  if(outcome.some(r=>!r.updated))throw Error('incomplete benchmark');
  const after=await stats(),commands=Object.fromEntries(Object.keys(before).map(k=>[k,after[k]-before[k]]));
  const total=Object.values(commands).reduce((a,b)=>a+b,0),expected=optimized?9*works.length+1:11*works.length;
  if(total!==expected)throw Error('Concurrent Redis activity contaminated commandstats; run benchmark while other local jobs are idle');
  results[optimized?'optimized':'before']={works:works.length,upstreamFixtureLoads:loads,clientRedisRPCs:rpcs,requestArgumentBytes,redisCommandsIncludingLua:Object.values(commands).reduce((a,b)=>a+b,0),commands,elapsedMs};
 }
 return {scope:'loopback Redis 7.2.6; 266 actual work IDs, successful empty JP fixture; no production calls',results,reductionPercent:{clientRPC:(1-results.optimized.clientRedisRPCs/results.before.clientRedisRPCs)*100,includingLua:(1-results.optimized.redisCommandsIncludingLua/results.before.redisCommandsIncludingLua)*100},billing:'RPC and server command counts are NOT confirmed Upstash billing counts'};
}
if(require.main===module)benchmark().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={benchmark};
