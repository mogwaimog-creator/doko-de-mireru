'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{randomBytes,createHash}=require('node:crypto');
const {inventory,classify}=require('../scripts/lib/migration-inventory');
const backup=require('../scripts/lib/redis-low-command-backup'),client=require('../scripts/lib/local-binary-redis');
const hash=x=>createHash('sha256').update(x).digest('hex');
const evidence=keys=>({complete:true,sha256:'f'.repeat(64),keyListSha256:hash(JSON.stringify([...keys].sort(Buffer.compare).map(k=>k.toString('base64'))))});
test('families include manual metadata, coordination, search and update history; binary and unknown keys are retained',()=>{
 const prefix='doko:ledger:release:'+'a'.repeat(16)+':';
 for(const [suffix,family]of [['work:v2:movie:1','work'],['work:v2:movie:1:meta','work'],['work:v2:movie:1:lease','coordination'],['seo:v1:movie:1','seo'],['person:v2:1','person'],['season:v1:tv:1','season'],['shared-stream:v1:record:movie:1','streaming'],['shared-stream:v1:lock:movie:1','coordination'],['search:v2:doc:work:movie:1','search-index'],['shared-stream:v1:batch-job:2026-11-14','update-history'],['ops:v1:last-success','update-history'],['content-control:v1','control-quota'],['recovery:v1:query:1','recovery-cache']])assert.equal(classify(Buffer.from(prefix+suffix)).family,family,suffix);
 assert.equal(classify(Buffer.from([0,255,128])).family,'unknown');
});
test('invalid or unreviewed manifest is rejected before sending any command',async()=>{
 const keys=[Buffer.from('owned')],send={command(){throw Error('unexpected network')},pipeline(){throw Error('unexpected network')}};
 for(const opts of [{keyManifest:keys},{keyManifest:keys,manifestEvidence:{...evidence(keys),complete:false}},{keyManifest:[...keys,...keys],manifestEvidence:evidence(keys)},{keyManifest:[Buffer.from('changed')],manifestEvidence:evidence(keys)}])await assert.rejects(backup.snapshot(send,{writersStopped:true,...opts}),/manifest/);
});
test('exact manifest snapshot and established restore retain all six types, lock/manual bytes and deadlines without SCAN', {skip:!process.env.REDIS_TEST_CLI},async()=>{
 const release=randomBytes(32).toString('hex'),prefix='doko:ledger:release:'+release.slice(0,16)+':',deadline=Date.now()+60000;
 const work=Buffer.from(prefix+'work:v2:movie:123'),manual=JSON.stringify({title:'固定名',lockedFields:['title'],pageExtras:{manual:'手動項目'},revision:42});
 const rows=[['SET',work,manual],['SET',prefix+'work:v2:movie:123:meta','{"revision":42}'],['SET',prefix+'seo:v1:movie:123','seo'],['SET',prefix+'person:v2:123','person'],['SET',prefix+'season:v1:tv:123','season'],['SET',prefix+'shared-stream:v1:record:movie:123','providers'],['SET',prefix+'shared-stream:v1:lock:movie:123','owner','PXAT',String(deadline)],['HSET',prefix+'cutover:v1:active','owner','ticket'],['ZADD',prefix+'search:v2:grams:work','1.5','term'],['RPUSH',prefix+'ops:v1:errors','old','new'],['SADD',prefix+'legacy-registry','a','b'],['XADD',prefix+'ops:v1:events','*','event','history'],['SET',Buffer.concat([Buffer.from(prefix),Buffer.from([0,255])]),Buffer.from([0,255,128,13,10])]];
 await client.pipeline(rows);const keys=rows.map(r=>Buffer.isBuffer(r[1])?r[1]:Buffer.from(r[1])),calls=[];
 const guarded={async command(a){calls.push(a[0]);assert(['DUMP','PEXPIRETIME','EXISTS','TIME'].includes(a[0]));return client.command(a)},async pipeline(batch){return Promise.all(batch.map(a=>guarded.command(a)))}};
 const send=backup.transport(guarded),artifact=await backup.snapshot(send,{writersStopped:true,keyManifest:keys,manifestEvidence:evidence(keys)});
 assert.equal(send.stats.commands,3*keys.length+1);assert(!calls.includes('SCAN'));assert.equal(artifact.inventoryMethod,'exact-manifest-no-scan');
 const proofPrefix='doko:dev:restore:manifest-proof:'+release.slice(0,16)+':',target='doko:dev:restore:manifest-target:'+release.slice(0,16)+':';
 const proof=await backup.proofFromLocal(backup.transport(client),artifact,{prefix:proofPrefix});
 const result=await backup.restoreVerified(backup.transport(client),artifact,proof,{prefix:target});assert.equal(result.complete,true);
 assert.equal((await client.command(['GET',Buffer.concat([Buffer.from(target),work])])).toString(),manual);
 assert.equal(await client.command(['PEXPIRETIME',target+prefix+'shared-stream:v1:lock:movie:123']),deadline);
 const plan=inventory(artifact,proof,{activeReleaseSha256:release});assert.equal(plan.count,keys.length);assert.equal(Object.keys(plan.types).length,6);assert.equal(plan.families.unknown,1);assert.equal(plan.families.coordination,2);assert.equal(plan.productionReady,false);assert.equal(plan.records.length,keys.length);assert.equal(plan.sourceCommandEstimate.exactManifest.commands,send.stats.commands);
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'doko-private-inventory-'));
 try{const archiveFile=path.join(directory,'archive.json'),proofFile=path.join(directory,'proof.json'),output=path.join(directory,'inventory.json');fs.writeFileSync(archiveFile,JSON.stringify(artifact),{mode:0o600});fs.writeFileSync(proofFile,JSON.stringify(proof),{mode:0o600});
 const args=[path.resolve(__dirname,'../scripts/migration-inventory.js'),archiveFile,proofFile,release,output],run=()=>spawnSync(process.execPath,args,{encoding:'utf8'});const first=run();assert.equal(first.status,0,first.stderr);assert(!first.stdout.includes('固定名'));assert.equal(fs.statSync(output).mode&0o777,0o600);const saved=fs.readFileSync(output);assert.equal(run().status,1);assert.deepEqual(fs.readFileSync(output),saved);
 }finally{fs.rmSync(directory,{recursive:true,force:true})}

 const bad=structuredClone(artifact);bad.records[0].dump='changed';assert.throws(()=>inventory(bad,proof,{activeReleaseSha256:release}),/hash/);
 assert.throws(()=>inventory(artifact,proof,{activeReleaseSha256:'bad'}),/release/);
});
