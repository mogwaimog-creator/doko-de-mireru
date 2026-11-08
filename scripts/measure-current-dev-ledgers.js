'use strict';
// Inventory a known set of isolated keys; no SCAN, production credentials or writes.
const {command}=require('../tests/helpers/local-redis');
const {inventory}=require('./audit-shared-ledgers');
const {keys}=require('../api/_dev-content-ledgers');
async function measure(){
 const report=inventory(),known=report.records.filter(r=>r.fields.title);
 const identities=[...report.records.map(r=>({type:r.type,id:r.id})),{type:'movie',id:862}];
 const groups={streaming:identities.map(w=>'doko:dev:shared-stream:v1:record:'+w.type+':'+w.id),legacyWatchCopies:report.records.map(w=>'doko:dev:legacy-watch:v3:'+w.type+':'+w.id),work:[...known.map(w=>keys.work(w.type,w.id)),keys.work('movie',862)],person:[keys.person(1813)],season:known.filter(w=>w.type==='tv').map(w=>keys.season(w.id)),seo:known.map(w=>keys.seo(w.type,w.id))};
 groups.contentMeta=[...groups.work,...groups.person,...groups.season,...groups.seo].map(k=>k+':meta');
 groups.searchCatalog=[require('../api/_dev-ledger-search').CATALOG];
 const measured={};
 for(const [group,names] of Object.entries(groups)){
  const raws=await command(['MGET',...names]);let redisBytes=0,jsonBytes=0,count=0;
  for(let i=0;i<names.length;i++){if(raws[i]===null)continue;count++;jsonBytes+=Buffer.byteLength(raws[i]);redisBytes+=await command(['MEMORY','USAGE',names[i]])}
  measured[group]={records:count,missing:names.length-count,jsonBytes,redisBytes,MB:redisBytes/1e6};
 }
 return {scope:'known loopback preview keys only; 266 repository IDs plus general-work fixture; seasons/person/provider data are explicitly fixtures',measured,totalMB:Object.values(measured).reduce((n,r)=>n+r.redisBytes,0)/1e6,excludes:'Redis process overhead, test/benchmark namespaces, full real people/season populations, production keys, legacy-work compatibility copies not staged in this preview, future growth, backups, active locks',productionCurrentMB:null,productionPeakMB:null,productionAfterMB:null,productionFreeHeadroom:null};
}
if(require.main===module)measure().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1});
module.exports={measure};
