'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {store,providers}=require('../prototype/streaming-ledger');
const {compatible}=require('../api/_shared-streaming-read');
const {inventory}=require('../scripts/audit-shared-ledgers');
const html=fs.readFileSync(path.join(__dirname,'../streaming.html'),'utf8');
const data=JSON.parse(html.match(/<script type="application\/json" id="series-comparison-data">([\s\S]*?)<\/script>/)[1]);
test('203 real historical entries: 152 ID-verified snapshots stay stale; 51 unverified entries rejected',()=>{
 const {records,rejected}=require('../prototype/shared-streaming-import').planComparisonSnapshot(data);
 assert.equal(records.length,152);assert.equal(rejected.length,51);
 for(const r of records){
  const result=compatible({...r,revision:1},r.type,r.id,Date.parse('2026-11-09T00:00:00Z'));
  assert(result);assert.equal(result.watch.stale,true);assert.equal(result.detail,null);
  assert.equal(result.watch.flatrate.length,providers({flatrate:data.snapshot[r.type+':'+r.id].streaming}).flatrate.length);
 }
});
test('real repository works preserve per-page membership and metadata confirmation locks',()=>{
 const report=inventory();assert.equal(Object.keys(report.seriesCounts).length,13);assert.equal(report.uniqueWorks,266);
 const ledger=require('../prototype/work-ledger').store();ledger.load(JSON.stringify({records:report.records}));
 const sample=report.records.find(w=>w.fields.title);const {type,id}=sample;
 ledger.edit(type,id,{overview:'手動の確認文'});ledger.confirm(type,id);ledger.automatic(type,id,{title:'should not overwrite',overview:'wrong'});
 assert.equal(ledger.display(type,id).overview,'手動の確認文');assert.equal(ledger.display(type,id).title,sample.fields.title);
 const before=JSON.parse(ledger.save()).records.find(w=>w.type===type&&w.id===id);
 assert(before.memberships.length>0);assert.equal(before.confirmed,true);
});
test('13-series membership inventory exactly matches the protected existing API arrays',()=>{
 const vm=require('node:vm'),{createRequire}=require('node:module');
 const file=path.join(__dirname,'../api/series-watch.js');
 const source=fs.readFileSync(file,'utf8').split('module.exports=')[0];
 const catalog=require('../data/watch-order-memberships.json'),names=Object.keys(catalog);
 const serialized=vm.runInNewContext(source+';JSON.stringify(Object.fromEntries('+JSON.stringify(names)+'.map(n=>[n,eval(n+"Works")])))',{require:createRequire(file),process});
 assert.deepEqual(JSON.parse(serialized),catalog);
});
test('all 266 repository titles resolve from explicit ID evidence without inventing full release dates',()=>{
 const audit=inventory();assert.equal(audit.titlesFound,266);assert.deepEqual(audit.missingTitles,[]);assert.equal(audit.seo.length,266);
 const evidence=require('../scripts/repository-work-evidence').evidence();assert(evidence.size>0);
 for(const [key,row] of evidence){assert(row.title);assert.match(key,/^(movie|tv):[1-9][0-9]*$/);assert(!Object.hasOwn(row,'releaseDate'));}
});
