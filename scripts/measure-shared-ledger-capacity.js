'use strict';
// Measures isolated local Redis only. Model is NOT production usage or real provider data.
const {command}=require('../tests/helpers/local-redis');
const {sharedStore}=require('../api/_shared-streaming-store');
const {inventory}=require('./audit-shared-ledgers');
const {service}=require('../prototype/streaming-ledger-service');
async function measure(){
 const run=Date.now(),prefix=`doko:dev:capacity:${run}:`,db=sharedStore(command,{prefix:prefix+'stream:'});
 const audit=inventory(),now='2026-11-09T00:00:00Z';
 const data={results:{JP:{flatrate:[{provider_id:8,provider_name:'Test provider fixture',logo_path:'/test-fixture.png'}],rent:[],buy:[]}}};
 const s=service(db,async()=>data),groups={legacyWatch:[],legacyDetail:[],newStream:[],work:[],seo:[]};
 const old=require('../data/streaming-works.json');
 for(const w of old){const k=prefix+'legacy-watch:'+w.type+':'+w.id;await command(['SET',k,JSON.stringify({flatrate:data.results.JP.flatrate,checkedAt:now,window:'2026-11-09-06'})]);groups.legacyWatch.push(k)}
 for(const r of audit.records){
  const identity=r.type+':'+r.id,k=prefix+'legacy-detail:'+identity;
  await command(['SET',k,JSON.stringify({data,checkedAt:now,lastAccessedAt:now})]);groups.legacyDetail.push(k);
  await s.visit(r.type,r.id,now,[]);groups.newStream.push(db.keys.dataKey(identity));
  const wk=prefix+'work:'+identity;await command(['SET',wk,JSON.stringify(r)]);groups.work.push(wk);
 }
 for(const r of audit.seo){const k=prefix+'seo:'+r.key;await command(['SET',k,JSON.stringify(r)]);groups.seo.push(k)}
 const measured={},backup=[];let backupBytes=0;
 for(const [name,keys] of Object.entries(groups)){
  let bytes=0,jsonBytes=0;
  for(const k of keys){bytes+=await command(['MEMORY','USAGE',k]);const raw=await command(['GET',k]);jsonBytes+=Buffer.byteLength(raw);if(name!=='newStream'&&name!=='work'&&name!=='seo')backup.push([k,raw])}
  measured[name]={keys:keys.length,redisBytes:bytes,jsonBytes,MB:bytes/1e6};
 }
 const backupJson=JSON.stringify(backup);await command(['SET',prefix+'backup',backupJson]);backupBytes=await command(['MEMORY','USAGE',prefix+'backup']);
 const historical=require('../prototype/shared-streaming-import').planComparisonSnapshot(JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname,'../streaming.html'),'utf8').match(/<script type="application\/json" id="series-comparison-data">([\s\S]*?)<\/script>/)[1]));
 const realSample={records:historical.records.length,rejected:historical.rejected.length,legacyBytes:0,newBytes:0};
 const historicalStore=sharedStore(command,{prefix:prefix+'historical:'});
 for(const r of historical.records){const k=r.type+':'+r.id,oldKey=prefix+'historical-old:'+k;await command(['SET',oldKey,JSON.stringify({flatrate:r.japan.flatrate.map(p=>({provider_id:p.providerId,provider_name:p.name,logo_path:p.logoPath})),checkedAt:r.lastSuccessAt})]);await historicalStore.acquire(k,'import',30000);await historicalStore.saveIfOwner(k,'import',r,0);await historicalStore.release(k,'import');realSample.legacyBytes+=await command(['MEMORY','USAGE',oldKey]);realSample.newBytes+=await command(['MEMORY','USAGE',historicalStore.keys.dataKey(k)]);}
 const oldBytes=measured.legacyWatch.redisBytes+measured.legacyDetail.redisBytes;
 const increment=measured.newStream.redisBytes+measured.work.redisBytes+measured.seo.redisBytes;
 const model={current:oldBytes,peak:oldBytes+increment+backupBytes,afterWithOldDataRetained:oldBytes+increment,targetOnlyAfterSeparateDeletionApproval:increment};
 return {scope:'local Redis 7.2.6 MEMORY USAGE; fictional one-provider JP fixture; static repository metadata only',realHistoricalSample:realSample,productionCurrent:'unmeasured: no credentials or billing/usage information',measured,backupBytes,backupJsonBytes:Buffer.byteLength(backupJson),incrementBytes:increment,model:Object.fromEntries(Object.entries(model).map(([k,v])=>[k,{bytes:v,MB:v/1e6,changePercent:(v-oldBytes)/oldBytes*100}])),assumptions:{watchWorks:271,detailWorks:266,newStreamWorks:266,metadataWorks:266,metadataTitlesKnown:audit.titlesFound,seoWorks:audit.seo.length,personSeasonBytes:'not measured; snapshots unavailable',backup:'one backup key in isolated Redis containing modeled old provider keys; no production backup',excluded:'Redis process overhead, TLS/network overhead, fragmentation, actual full fixed metadata, people, seasons, future growth; add measured sizes before production'},productionFormula:{current:'P (unknown)',peak:'P + new ledgers delta + backup B + active locks + allocator headroom',afterRetainingOld:'P + new ledgers delta',changePercent:'(delta / P) * 100; cannot calculate until P and coverage are measured'}};
}
if(require.main===module)measure().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={measure};
