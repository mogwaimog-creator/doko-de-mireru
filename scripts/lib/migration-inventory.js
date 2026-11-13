'use strict';
// Offline planning only; reuses the established archive/proof validators.
const {createHash}=require('node:crypto');
const {validate,validateProof}=require('./redis-low-command-backup');
const sha=x=>createHash('sha256').update(x).digest('hex');
function classify(bytes){
 const key=bytes.toString('utf8');
 const physical=key.match(/^doko:ledger:(release|probe):([a-f0-9]{16}):/);
 const prefix=physical?.[0]||(key.startsWith('doko:dev:')?'doko:dev:':null);
 const suffix=prefix?key.slice(prefix.length):key;
 let family='unknown';
 if(prefix){
  if(/(?:^|:)(?:lease|lock)$|^shared-stream:v1:(?:lock:|series-batch-lease$)|^cutover:v1:active$/.test(suffix))family='coordination';
  else if(/^work:v2:/.test(suffix))family='work';
  else if(/^seo:v1:/.test(suffix))family='seo';
  else if(/^person:v2:/.test(suffix))family='person';
  else if(/^season:v1:/.test(suffix))family='season';
  else if(/^search:v2:/.test(suffix))family='search-index';
  else if(/^shared-stream:v1:record:/.test(suffix))family='streaming';
  else if(/^shared-stream:v1:batch-job:|^stream-jobs:|^ops:/.test(suffix))family='update-history';
  else if(/^content-control:|^acquisition|^source:/.test(suffix))family='control-quota';
  else if(/^recovery:/.test(suffix))family='recovery-cache';
  else if(/^legacy-/.test(suffix))family='legacy';
 }
 return {namespace:prefix||'unrecognized',family};
}
function inventory(artifact,proof,{activeReleaseSha256,dbIndex=0}={}){
 validate(artifact);validateProof(artifact,proof);
 if(!/^[a-f0-9]{64}$/.test(activeReleaseSha256||'')||!Number.isSafeInteger(dbIndex)||dbIndex<0)throw Error('reviewed active release and database required');
 const activeNamespace='doko:ledger:release:'+activeReleaseSha256.slice(0,16)+':';
 const families={},namespaces={},types={};let bytes=0;
 const records=artifact.records.map((r,i)=>{const key=Buffer.from(r.key,'base64'),c=classify(key),type=proof.records[i].type;families[c.family]=(families[c.family]||0)+1;namespaces[c.namespace]=(namespaces[c.namespace]||0)+1;types[type]=(types[type]||0)+1;bytes+=key.length+Buffer.from(r.dump,'base64').length;return {key:r.key,keySha256:sha(key),...c,type,dumpSha256:r.dumpSha256,expiresAt:r.expiresAt}});
 const body={version:1,archiveSha256:artifact.sha256,proofSha256:proof.sha256,dbIndex,activeNamespace,count:records.length,rawBytes:bytes,families,namespaces,types,records,sourceCommandEstimate:{rdbExport:{applicationRedisCommands:0,providerCost:'must confirm; not assumed free or unmetered'},exactManifest:{commands:3*records.length+1,explanation:'DUMP + PEXPIRETIME + EXISTS per key; TIME once; inventory capture and source freeze excluded'}},warnings:[...(!namespaces[activeNamespace]?['active release namespace absent']:[]),...(families.unknown?['unknown keys retained; classification review required']:[]),...(families.coordination?['coordination keys retained; writer drain and leases require review']:[])],completeness:'covers this archive/database only; full database/key inventory and stopped writers need independent evidence',productionReady:false};
 return {...body,sha256:sha(Buffer.from(JSON.stringify(body)))};
}
module.exports={inventory,classify};
