'use strict';
// Dedicated original-key migration. Injected binary transport; no source service, deletion or replay.
const { createHash } = require('node:crypto');
const { validate, validateProof, snapshot, transport } = require('./redis-low-command-backup');
const { classify } = require('./migration-inventory');
const hash = x => createHash('sha256').update(x).digest('hex');
const seal = value => { const {sha256, ...body} = value; return { ...body, sha256: hash(Buffer.from(JSON.stringify(body))) }; };
const text = x => Buffer.isBuffer(x) ? x.toString() : String(x);
const LIMIT = 4 * 1024 * 1024;
function fail(code) { const e = Error(code); e.code = code; throw e; }
function checkSeal(value) { const { sha256, ...body } = value || {}; if (sha256 !== hash(Buffer.from(JSON.stringify(body)))) fail('CHECKSUM'); }
function fields(reply) { return Object.fromEntries(text(reply).split('\r\n').filter(x => x.includes(':')).map(x => { const i = x.indexOf(':'); return [x.slice(0, i), x.slice(i + 1)]; })); }
async function now(send) { const t = await send.command(['TIME']); const n = Number(text(t[0])) * 1000 + Math.floor(Number(text(t[1])) / 1000); if (!Number.isSafeInteger(n)) fail('CLOCK'); return n; }
function number(v) { const n = Number(v); if (!/^\d+$/.test(String(v)) || !Number.isSafeInteger(n)) fail('METRIC'); return n; }
async function state(send) {
  const memory = fields(await send.command(['INFO', 'memory']));
  const stats = fields(await send.command(['INFO', 'stats']));
  const server = fields(await send.command(['INFO', 'server']));
  return { used: number(memory.used_memory), peak: number(memory.used_memory_peak), max: number(memory.maxmemory), policy: memory.maxmemory_policy, evicted: number(stats.evicted_keys), version: server.valkey_version || server.redis_version };
}
async function databases(send) {
  const info = fields(await send.command(['INFO', 'keyspace']));
  const dbs = Object.keys(info).filter(x => /^db\d+$/.test(x)).map(x => Number(x.slice(2))).sort((a,b) => a-b);
  if (dbs.length > 64 || dbs.some(x => x > 1023)) fail('DATABASE_BOUND');
  return dbs;
}
async function select(send, db) { if (text(await send.command(['SELECT', String(db)])) !== 'OK') fail('SELECT'); }
async function keys(send) {
  const found = new Map(); let cursor = '0', passes = 0;
  do {
    const r = await send.command(['SCAN', cursor, 'COUNT', '128']); cursor = text(r[0]);
    if (!/^\d+$/.test(cursor) || !Array.isArray(r[1]) || ++passes > 100000) fail('SCAN_BOUND');
    for (const k of r[1]) { if (!Buffer.isBuffer(k)) fail('BINARY_REQUIRED'); found.set(k.toString('base64'), k); if (found.size > 100000) fail('KEY_BOUND'); }
  } while (cursor !== '0');
  return found;
}
function validateBundle(bundle) {
  checkSeal(bundle);
  if (bundle.version !== 1 || !/^[a-f0-9]{64}$/.test(bundle.rdbSha256 || '') || !/^[a-f0-9]{64}$/.test(bundle.releaseSha256 || '') || !/^9\.1\.3$/.test(bundle.valkeyVersion || '') || !Array.isArray(bundle.databases) || bundle.databases.length > 64 || !bundle.databases.length) fail('BUNDLE_FORMAT');
  const seen = new Set(); let total = 0;
  for (const db of bundle.databases) {
    if (!Number.isInteger(db.index) || db.index < 0 || db.index > 1023 || seen.has(db.index)) fail('DATABASE_DUPLICATE'); seen.add(db.index);
    validate(db.archive); validateProof(db.archive, db.proof);
    if (db.archive.pattern !== '*' || db.archive.expiredDuringRead.length) fail('CAPTURE_EXPIRED_RETRY_OFFLINE');
    total += db.archive.count;
    for (let i=0;i<db.archive.count;i++) {
      const r=db.archive.records[i], p=db.proof.records[i];
      if (Buffer.from(r.key,'base64').length > 65536 || Buffer.from(r.dump,'base64').length > LIMIT || p.valueBytes > LIMIT || !Number.isSafeInteger(p.memoryBytes) || p.memoryBytes < 1) fail('RECORD_BOUND');
    }
  }
  if (total > 100000) fail('KEY_BOUND');
  return true;
}
function ledgerSummary(bundle) {
  const result = {}; const warnings = [];
  for (const db of bundle.databases) {
    const physical = new Set(db.archive.records.map(r => Buffer.from(r.key,'base64').toString('utf8')));
    for (const r of db.archive.records) {
      const key=Buffer.from(r.key,'base64'), c=classify(key); result[c.family]=(result[c.family]||0)+1;
      const s=key.toString('utf8');
      // Read-only baseline audit. Never repairs source inconsistencies.
      const m=s.match(/^(.*:)(?:seo:v1:(movie|tv):|season:v1:(tv):|shared-stream:v1:record:(movie|tv):)(\d+)$/);
      if (m && !physical.has(m[1]+'work:v2:'+(m[2]||m[3]||m[4])+':'+m[5])) warnings.push({db:db.index,keySha256:hash(key),issue:'canonical-work-absent-in-source'});
    }
  }
  const active='doko:ledger:release:'+bundle.releaseSha256.slice(0,16)+':';
  const activeNamespacePresent=bundle.databases.some(db=>db.archive.records.some(r=>Buffer.from(r.key,'base64').subarray(0,Buffer.byteLength(active)).equals(Buffer.from(active))));
  return { families: result, baselineWarnings: warnings, activeNamespacePresent };
}
async function capture(send, { rdbSha256, releaseSha256, writersStopped = false, exportComplete = false } = {}) {
  if (!writersStopped || !exportComplete || !/^[a-f0-9]{64}$/.test(rdbSha256||'') || !/^[a-f0-9]{64}$/.test(releaseSha256||'')) fail('SOURCE_ATTESTATION');
  const s = await state(send); if (s.version !== '9.1.3') fail('VALKEY_VERSION');
  const dbs = await databases(send); if (!dbs.length) fail('EMPTY_SOURCE_REVIEW');
  const output = [];
  for (const index of dbs) {
    await select(send,index);
    const archive = await snapshot(send,{writersStopped:true,maxBytes:256*1024*1024});
    if (archive.expiredDuringRead.length) fail('CAPTURE_EXPIRED_RETRY_OFFLINE');
    const records=[];
    for (const r of archive.records) {
      const key=Buffer.from(r.key,'base64'), type=text(await send.command(['TYPE',key]));
      const dump=await send.command(['DUMP',key]);
      if (!Buffer.isBuffer(dump) || hash(dump)!==r.dumpSha256) fail('SOURCE_CHANGED');
      const value=type==='string'?await send.command(['GET',key]):null;
      if(type==='string'&&!Buffer.isBuffer(value)) fail('SOURCE_CHANGED');
      records.push({key:r.key,type,dumpSha256:r.dumpSha256,valueSha256:value===null?null:hash(value),valueBytes:value===null?null:value.length,memoryBytes:Number(await send.command(['MEMORY','USAGE',key,'SAMPLES','0']))});
    }
    if (output.reduce((n,d)=>n+d.archive.rawBytes,archive.rawBytes)>256*1024*1024) fail('BUNDLE_BYTE_BOUND');
    output.push({index,archive,proof:seal({version:1,archiveSha256:archive.sha256,scope:'full local original-key proof',records})});
  }
  const bundle=seal({version:1,rdbSha256,releaseSha256,valkeyVersion:s.version,databases:output});
  validateBundle(bundle);
  await verify(send,bundle); // Original source must still match in full; no capture-time data mutation.
  return bundle;
}
async function verify(send,bundle,{onProgress=async()=>{}}={}) {
  validateBundle(bundle); const before=await state(send);
  if(before.version!==bundle.valkeyVersion) fail('VALKEY_VERSION');
  const expectedDbs=new Set(bundle.databases.map(d=>d.index));
  if ((await databases(send)).some(d=>!expectedDbs.has(d))) fail('EXTRA_DATABASE');
  let verified=0,expired=0;
  for(const db of bundle.databases) {
    await select(send,db.index);const expected=new Map(db.archive.records.map((r,i)=>[r.key,{r,p:db.proof.records[i]}]));
    for(const k of (await keys(send)).keys()) if(!expected.has(k)) fail('EXTRA_KEY');
    for(const {r,p} of expected.values()) {
      const key=Buffer.from(r.key,'base64');
      const dump=await send.command(['DUMP',key]);
      const expiry=Number(await send.command(['PEXPIRETIME',key]));
      if(expiry===-2) {
        if(r.expiresAt===null || r.expiresAt>await now(send)) fail('MISSING_KEY');
        expired++;continue;
      }
      if(!Buffer.isBuffer(dump)||hash(dump)!==r.dumpSha256||expiry!==(r.expiresAt??-1)||text(await send.command(['TYPE',key]))!==p.type) fail('VALUE_TYPE_TTL_MISMATCH');
      if(p.type==='string') { const value=await send.command(['GET',key]); if(!Buffer.isBuffer(value)||value.length!==p.valueBytes||hash(value)!==p.valueSha256) fail('VALUE_TYPE_TTL_MISMATCH'); }
      verified++;await onProgress({verified,expired});
    }
    // Re-scan to catch added keys, including expired expected keys recreated by another writer.
    for(const [k] of await keys(send)) { const record=expected.get(k)?.r; if(!record) fail('EXTRA_KEY'); if(record.expiresAt!==null&&record.expiresAt<=await now(send)) fail('EXPIRED_KEY_PRESENT'); }
  }
  if ((await databases(send)).some(d=>!expectedDbs.has(d))) fail('EXTRA_DATABASE');
  const after=await state(send);if(after.evicted!==before.evicted) fail('EVICTION');
  return {status:'PASS',bundleSha256:bundle.sha256,verified,expired,databases:bundle.databases.length,peakBytes:after.peak,usedBytes:after.used,...ledgerSummary(bundle),scope:'all original bytes/types/absolute expiries and ledger preservation; source baseline warnings are not repaired'};
}
function validateRehearsal(bundle,report,maxmemory) {
  checkSeal(report);
  if(report.kind!=='local-rehearsal'||report.bundleSha256!==bundle.sha256||report.valkeyVersion!==bundle.valkeyVersion||report.maxmemory!==maxmemory||report.status!=='PASS'||report.verification?.status!=='PASS'||report.verification.bundleSha256!==bundle.sha256||!Number.isSafeInteger(report.restored)||!Number.isSafeInteger(report.expired)||report.restored+report.expired!==bundle.databases.reduce((n,d)=>n+d.archive.count,0)||!Number.isSafeInteger(report.incrementBytes)||report.incrementBytes<0||!Number.isSafeInteger(report.largestIncrementBytes)||report.largestIncrementBytes<1) fail('REHEARSAL_REQUIRED');
}
async function restore(send,bundle,{writersStopped=false,localRehearsal=false,rehearsal=null,maxmemory=312475648,journal,signal}={}) {
  validateBundle(bundle);
  if(!writersStopped||typeof journal!=='function'||!Number.isSafeInteger(maxmemory)||maxmemory<1) fail('TARGET_ATTESTATION');
  if(!localRehearsal)validateRehearsal(bundle,rehearsal,maxmemory);
  const summary=ledgerSummary(bundle);
  // Preserve pre-existing reference gaps verbatim; full byte/type/expiry verification still applies.
  if(!summary.activeNamespacePresent) fail('SOURCE_LEDGER_REFERENCE_REVIEW');
  let s=await state(send);const baseline=s;
  const ceiling=Math.floor(maxmemory*0.7);
  if(s.version!==bundle.valkeyVersion||s.max!==maxmemory||s.policy!=='noeviction'||s.used>=ceiling||s.peak>=ceiling) fail('CAPACITY_OR_POLICY');
  const projected=localRehearsal?0:rehearsal.incrementBytes+rehearsal.largestIncrementBytes;
  if(s.used+projected>=ceiling) fail('CAPACITY_PROJECTION');
  if((await databases(send)).length) fail('NONEMPTY_TARGET');
  // Every SELECT is tested before any RESTORE; never collapse databases into db0.
  for(const db of bundle.databases) {await select(send,db.index);if(Number(await send.command(['DBSIZE']))!==0)fail('NONEMPTY_TARGET');}
  await journal({phase:'start',bundleSha256:bundle.sha256,maxmemory});
  if(summary.baselineWarnings.length) await journal({phase:'source-baseline-warnings',bundleSha256:bundle.sha256,baselineWarnings:summary.baselineWarnings});
  let restored=0,expired=0,largestIncrementBytes=1;
  for(const db of bundle.databases) {
    await select(send,db.index);
    for(let i=0;i<db.archive.count;i++) {
      if(signal?.aborted)fail('INTERRUPTED');
      const r=db.archive.records[i],p=db.proof.records[i], key=Buffer.from(r.key,'base64');
      if(r.expiresAt!==null&&r.expiresAt<=await now(send)){expired++;await journal({phase:'expired',db:db.index,index:i});continue;}
      const next=await state(send);
      // Memory usage is only an estimate. Stop well before maxmemory; never trust compressed DUMP length.
      if(next.max!==maxmemory||next.policy!=='noeviction'||next.evicted!==baseline.evicted||Math.max(next.used,next.peak)+Math.max(p.memoryBytes*2,65536)>=ceiling)fail('CAPACITY_OR_POLICY');
      if(Number(await send.command(['EXISTS',key]))!==0)fail('KEY_COLLISION');
      await journal({phase:'intent',db:db.index,index:i}); // fsync before write; timeout => unknown, no replay.
      if(signal?.aborted)fail('INTERRUPTED');
      if(text(await send.command(['RESTORE',key,String(r.expiresAt??0),Buffer.from(r.dump,'base64'),...(r.expiresAt===null?[]:['ABSTTL'])]))!=='OK')fail('RESTORE_REPLY');
      restored++;await journal({phase:'ack',db:db.index,index:i,restored});
      s=await state(send);largestIncrementBytes=Math.max(largestIncrementBytes,s.used-next.used);
      if(s.evicted!==baseline.evicted||s.used>=ceiling||s.peak>=ceiling)fail('CAPACITY_OR_POLICY');
    }
  }
  const verification=await verify(send,bundle);
  s=await state(send);
  if(s.max!==maxmemory||s.policy!=='noeviction'||s.evicted!==baseline.evicted||Math.max(s.used,s.peak)>=ceiling)fail('CAPACITY_OR_POLICY');
  await journal({phase:'verified',bundleSha256:bundle.sha256,restored,expired});
  return seal({kind:localRehearsal?'local-rehearsal':'original-key-restore',status:'PASS',bundleSha256:bundle.sha256,valkeyVersion:bundle.valkeyVersion,maxmemory,incrementBytes:Math.max(0,s.peak-baseline.used),largestIncrementBytes,restored,expired,verification});
}
module.exports={capture,verify,restore,validateBundle,seal,hash,fields,ledgerSummary,transport};
