'use strict';
// Real local Redis counters, no upstream network. Run while other tests are idle.
const {command}=require('../tests/helpers/local-redis');
const {sharedStore}=require('../api/_shared-streaming-store'),{dailyJobStore}=require('../api/_dev-daily-job-store'),{dailyJob}=require('../api/_streaming-daily-job');
async function stats(){const text=await command(['INFO','commandstats']);return Object.fromEntries(['get','set','mget','eval','pttl','del','mset','exists'].map(k=>[k,Number(text.match(new RegExp('cmdstat_'+k+':calls=(\\d+)'))?.[1]||0)]))}
async function benchmark(){
 let rpcs=0,loads=0,requestArgumentBytes=0;const send=args=>{rpcs++;requestArgumentBytes+=args.reduce((n,v)=>n+Buffer.byteLength(String(v)),0);return command(args)},prefix=`doko:dev:daily-bench:${Date.now()}:`;
 const db=sharedStore(send,{prefix:prefix+'records:'}),jobs=dailyJobStore(send,{prefix:prefix+'jobs:'}),works=require('./audit-shared-ledgers').inventory().records;
 const before=await stats(),start=Date.now();const result=await dailyJob(db,jobs,async()=>{loads++;return {results:{JP:{flatrate:[],rent:[],buy:[]}}}}).run('2026-11-09T21:00:00Z',works);
 const elapsedMs=Date.now()-start,after=await stats(),commands=Object.fromEntries(Object.keys(before).map(k=>[k,after[k]-before[k]])),total=Object.values(commands).reduce((a,b)=>a+b,0);
 if(result.status!=='complete'||total!==2896||rpcs!==580)throw Error('incomplete or contaminated daily benchmark: '+JSON.stringify({result,total,rpcs}));
 const raw=await command(['GET',jobs.keys.dayKey(result.day)]),journalRedisBytes=await command(['MEMORY','USAGE',jobs.keys.dayKey(result.day)]);
 return {scope:'local Redis 7.2.6 only; successful empty JP fixture, 266 actual IDs',result,upstreamFixtureLoads:loads,clientRedisRPCs:rpcs,requestArgumentBytes,redisCommandsIncludingLua:total,commands,elapsedMs,journalJsonBytes:Buffer.byteLength(raw),journalRedisBytes,monthlyJournalBytes30:journalRedisBytes*30,yearlyJournalBytes365:journalRedisBytes*365,billing:'Not confirmed Upstash billable counts; no live Upstash/Vercel/TMDB'};
}
if(require.main===module)benchmark().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});module.exports={benchmark};
