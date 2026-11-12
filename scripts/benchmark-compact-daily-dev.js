'use strict';
// Idle loopback Redis only. No live APIs, credentials or resource creation.
const {command}=require('../tests/helpers/local-redis'),{sharedStore}=require('../api/_shared-streaming-store'),{dailyJobStore}=require('../api/_dev-daily-job-store'),{compactDailyJobStore}=require('../api/_compact-daily-job-store'),{dailyJob}=require('../api/_streaming-daily-job');
const names=['get','set','mget','eval','pttl','del','mset','hget','hset','hgetall','exists','expire'];
async function stats(){const raw=await command(['INFO','commandstats']);return Object.fromEntries(names.map(k=>[k,Number(raw.match(new RegExp('cmdstat_'+k+':calls=(\\d+)'))?.[1]||0)]))}
async function benchmark(){
 const works=require('./audit-shared-ledgers').inventory().records,at='2026-11-09T00:00:00Z',results={};
 for(const compact of [false,true]){
  let rpcs=0,requestArgumentBytes=0,loads=0;const send=args=>{rpcs++;requestArgumentBytes+=args.reduce((n,a)=>n+Buffer.byteLength(String(a)),0);return command(args)},prefix=`doko:dev:packed-benchmark:${Date.now()}:${compact?'packed':'old'}:`;
  const records=sharedStore(send,{prefix:prefix+'records:'}),jobs=compact?compactDailyJobStore(send,{prefix:prefix+'jobs:',clock:()=>Date.parse(at)}):dailyJobStore(send,{prefix:prefix+'jobs:'});const before=await stats(),start=Date.now();
  const result=await dailyJob(records,jobs,async()=>{loads++;return {results:{JP:{flatrate:[],rent:[],buy:[]}}}}).run(at,works);const elapsedMs=Date.now()-start,after=await stats(),commands=Object.fromEntries(names.map(k=>[k,after[k]-before[k]])),operations=Object.values(commands).reduce((a,b)=>a+b,0);
  if(result.status!=='complete'||loads!==266||rpcs!==580||operations!==(compact?2990:2896))throw Error('incomplete or contaminated benchmark '+JSON.stringify({result,loads,rpcs,operations}));
  const journalRedisBytes=await command(['MEMORY','USAGE',jobs.keys.dayKey(result.day)]),ttl=await command(['TTL',jobs.keys.dayKey(result.day)]);
  results[compact?'packedV2':'jsonV1']={works:266,result,clientRedisRPCs:rpcs,redisOperationsIncludingLua:operations,requestArgumentBytes,upstreamFixtureLoads:loads,commands,elapsedMs,journalRedisBytes,ttlSeconds:ttl};
 }
 return {scope:'Redis 7.2.6 loopback; 266 repository IDs; successful empty JP fixture',results,reductionPercent:{requestArguments:(1-results.packedV2.requestArgumentBytes/results.jsonV1.requestArgumentBytes)*100,journalMemory:(1-results.packedV2.journalRedisBytes/results.jsonV1.journalRedisBytes)*100},retention:{newV2Days:14,newV2SteadyBytes14Days:results.packedV2.journalRedisBytes*14,newV2Conservative15CalendarDaysBytes:results.packedV2.journalRedisBytes*15,oldV1MonthlyGrowthBytes30Days:results.jsonV1.journalRedisBytes*30,oldV1YearlyGrowthBytes365Days:results.jsonV1.journalRedisBytes*365,existingV1:'untouched; not expired/deleted'},billing:'Neither local server operation counts nor argument bytes are confirmed Upstash billable units. Excludes responses, protocol, TLS and reader traffic.'};
}
if(require.main===module)benchmark().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});module.exports={benchmark};
