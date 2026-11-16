'use strict';
// No application imports, credentials, default transport, writes or automatic retries.
const FAMILIES = ['work', 'streaming', 'person', 'season', 'seo'];
const missing = reason => ({ value: null, status: '未取得', reason });
const known = value => ({ value, status: '取得済み' });
function integer(v) { return /^\d+$/.test(String(v)) && Number.isSafeInteger(Number(v)) ? Number(v) : null; }
function fields(raw) { return Object.fromEntries(String(raw).split(/\r?\n/).filter(l => l.includes(':')).map(l => { const i=l.indexOf(':'); return [l.slice(0,i),l.slice(i+1)]; })); }
function dayAt(at) { return new Date(Date.parse(at)+9*3600000).toISOString().slice(0,10); }
function family(key, prefix) {
  if (!key.startsWith(prefix)) return null;
  const s=key.slice(prefix.length);
  if (/^work:v2:(movie|tv):[1-9]\d*$/.test(s)) return 'work';
  if (/^shared-stream:v1:record:(movie|tv):[1-9]\d*$/.test(s)) return 'streaming';
  if (/^person:v2:[1-9]\d*$/.test(s)) return 'person';
  if (/^season:v1:tv:[1-9]\d*$/.test(s)) return 'season';
  if (/^seo:v1:(movie|tv):[1-9]\d*$/.test(s)) return 'seo';
  return null;
}
function compareBaseline(current, baseline, { prefix, db, at }) {
  const result=Object.fromEntries(FAMILIES.map(f=>[f,{baseline:missing('移管完了基準なし'), netIncrease:missing('未確認'), newSurviving:missing('未確認')}]));
  if (!baseline || baseline.kind!=='completed-aiven-restore' || baseline.complete!==true || baseline.prefix!==prefix || baseline.db!==db || !Number.isFinite(Date.parse(baseline.at)) || Date.parse(baseline.at)>Date.parse(at) || typeof baseline.evidence!=='string' || !baseline.evidence.trim()) return result;
  if (!Array.isArray(baseline.keys) || baseline.keys.length>4096 || baseline.keys.some(k=>typeof k!=='string'||!k.startsWith(prefix)) || new Set(baseline.keys).size!==baseline.keys.length) return result;
  for (const f of FAMILIES) {
    const old=new Set(baseline.keys.filter(k=>family(k,prefix)===f));
    result[f].baseline=known(old.size);
    if (current) {
      const rows=current.filter(k=>family(k,prefix)===f);
      result[f].netIncrease=known(rows.length-old.size);
      result[f].newSurviving=known(rows.filter(k=>!old.has(k)).length);
    }
  }
  return result;
}
async function collect({ command, prefix, db=0, scan=false, baseline=null, clock=Date.now, timeoutMs=2000 }) {
  if (typeof command!=='function' || !/^doko:ledger:release:[a-f0-9]{16}:$/.test(prefix||'') || !Number.isInteger(db)||db<0||db>1023 || !Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>2000) throw Error('Invalid analysis configuration');
  const started=clock(), at=new Date(started).toISOString(), day=dayAt(at);
  let commands=0, responseBytes=0;
  const allowed=new Set();
  const controlKey=prefix+'content-control:v1', attemptsKey=prefix+'acquisition:v1:attempts:'+day;
  async function read(args) {
    const op=args[0];
    const valid=(op==='SELECT'&&args.length===2&&args[1]===String(db)) || (op==='TIME'&&args.length===1) || (op==='INFO'&&args.length===2&&['server','memory','clients','stats','commandstats','keyspace'].includes(args[1])) || (op==='ZCARD'&&args.length===2&&[prefix+'search:v2:ids:work',prefix+'search:v2:ids:person'].includes(args[1])) || (op==='SCAN'&&scan&&args.length===6&&/^\d+$/.test(args[1])&&args[2]==='MATCH'&&args[3]===prefix+'*'&&args[4]==='COUNT'&&args[5]==='128') || (op==='GET'&&args.length===2&&[controlKey,attemptsKey,...allowed].includes(args[1]));
    if(!valid||++commands>38||clock()-started>90000) throw Error('Read budget refused');
    let timer;
    try {
      const reply=await Promise.race([Promise.resolve().then(()=>command([...args])),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('deadline')),timeoutMs);})]);
      const bytes=Buffer.byteLength(JSON.stringify(reply)??'null'); responseBytes+=bytes;
      if(bytes>262144||responseBytes>1048576) throw Error('Reply bound');
      return reply;
    } finally { clearTimeout(timer); }
  }
  async function optional(args) { try { return {ok:true,raw:await read(args)}; } catch { return {ok:false}; } }
  // Fail closed on wrong database; never fall back to DB0 or another service.
  if(await read(['SELECT',String(db)])!=='OK') throw Error('Database selection failed');
  const time=await read(['TIME']);
  if(!Array.isArray(time)||time.length!==2||integer(time[0])===null||integer(time[1])===null||Math.abs(Number(time[0])*1000-started)>60000) throw Error('Server clock mismatch');
  const metrics={};
  for(const section of ['server','memory','clients','stats','commandstats','keyspace']) {
    const reply=await optional(['INFO',section]); const f=reply.ok?fields(reply.raw):{};
    if(section==='server') metrics.uptimeSeconds=integer(f.uptime_in_seconds)===null?missing('統計取得不可'):known(integer(f.uptime_in_seconds));
    if(section==='memory') for(const k of ['used_memory','used_memory_peak','maxmemory']) metrics[k]=integer(f[k])===null?missing('統計取得不可'):known(integer(f[k]));
    if(section==='clients') metrics.connected_clients=integer(f.connected_clients)===null?missing('統計取得不可'):known(integer(f.connected_clients));
    if(section==='stats') for(const k of ['total_commands_processed','total_error_replies','evicted_keys','expired_keys']) metrics[k]=integer(f[k])===null?missing('統計取得不可'):known(integer(f[k]));
    if(section==='commandstats') metrics.commandstats=reply.ok?known(Object.fromEntries(Object.entries(f).filter(([k])=>/^cmdstat_[a-z0-9_|-]+$/.test(k)).map(([k,v])=>[k,Object.fromEntries(v.split(',').map(x=>x.split('=')).filter(([n,v])=>['calls','failed_calls','rejected_calls'].includes(n)&&integer(v)!==null).map(([n,v])=>[n,integer(v)]))]))):missing('権限または統計取得不可');
    if(section==='keyspace') {
      const counts=Object.entries(f).filter(([k])=>/^db\d+$/.test(k));
      const all=counts.map(([k,v])=>[k,integer(v.match(/(?:^|,)keys=(\d+)(?:,|$)/)?.[1])]);
      metrics.databaseKeys=reply.ok&&all.every(([,n])=>n!==null)?known(Object.fromEntries(all)):missing('統計取得不可');
      metrics.totalKeys=reply.ok&&all.every(([,n])=>n!==null)?known(all.reduce((n,[,v])=>n+v,0)):missing('統計取得不可');
    }
  }
  const registry={};
  for(const f of ['work','person']) { const r=await optional(['ZCARD',prefix+'search:v2:ids:'+f]); registry[f]=r.ok&&integer(r.raw)!==null?known(integer(r.raw)):missing('registry取得不可'); }
  const c=await optional(['GET',controlKey]); let control={};
  try { if(!c.ok||c.raw===null) throw Error(); control=JSON.parse(c.raw); } catch { control={}; }
  const a=await optional(['GET',attemptsKey]);
  const acquisition={newWorkDailyLimit:integer(control.newWorkDailyLimit)===null?missing('実設定未取得・未設定'):known(integer(control.newWorkDailyLimit)), newWorkAcquisitionPaused:typeof control.newWorkAcquisitionPaused==='boolean'?known(control.newWorkAcquisitionPaused):missing('実設定未取得・未設定'), attempts:a.ok&&integer(a.raw)!==null?known(integer(a.raw)):missing('当日キー欠落・権限・応答不正'), success:missing('成功イベント履歴なし'), failure:missing('失敗イベント履歴なし')};
  const keys=new Set(); let complete=false, scanCalls=0;
  // Missing/wrong prefix must never become a certified empty ledger.
  if(scan && control.status==='ready') {
    let cursor='0';
    try { do {
      const r=await read(['SCAN',cursor,'MATCH',prefix+'*','COUNT','128']); scanCalls++;
      if(!Array.isArray(r)||r.length!==2||!/^\d+$/.test(String(r[0]))||!Array.isArray(r[1])) throw Error('Invalid scan');
      for(const k of r[1]) { if(typeof k!=='string'||!k.startsWith(prefix)||Buffer.byteLength(k)>1024) throw Error('Invalid key'); keys.add(k); }
      if(keys.size>4096) throw Error('Key bound'); cursor=String(r[0]);
      if(cursor==='0') { complete=true; break; }
    } while(scanCalls<8); } catch { complete=false; }
  }
  const comparison=compareBaseline(complete?[...keys]:null,baseline,{prefix,db,at});
  const ledgers=Object.fromEntries(FAMILIES.map(f=>[f,{current:complete?known([...keys].filter(k=>family(k,prefix)===f).length):missing(scan?'列挙上限・権限・応答不正':'列挙未実施'),...comparison[f]}]));
  const streamKeys=[...keys].filter(k=>family(k,prefix)==='streaming').sort().slice(0,16);
  const streaming={scope:'最大16件の標本。全体へ外挿しない',read:0,unavailable:0,withSuccess:0,openErrorRecords:0};
  for(const key of streamKeys) { allowed.add(key); const r=await optional(['GET',key]); try { if(!r.ok||r.raw===null) throw Error(); const v=JSON.parse(r.raw); if(!Array.isArray(v.errors)||!Object.hasOwn(v,'lastSuccessAt'))throw Error(); streaming.read++; if(Number.isFinite(Date.parse(v.lastSuccessAt)))streaming.withSuccess++; if(v.errors.some(e=>e.status==='open'))streaming.openErrorRecords++; } catch {streaming.unavailable++;} }
  return {schemaVersion:1,day,timezone:'Asia/Tokyo',observedAt:at,finishedAt:new Date(clock()).toISOString(),db,prefix,scope:'採取区間中の観測。SCANは原子的snapshotではない',scan:{enabled:scan,calls:scanCalls,complete},commands,responseBytes,metrics,registry,ledgers,acquisition,streaming,vercel:missing('外部collector未接続'),tmdb:missing('外部collector未接続'),alerts:[...(scan&&!complete?['台帳列挙未完了']:[]),...(acquisition.newWorkDailyLimit.value!==300?['新規作品300件設定を確認できない']:[])]};
}
function dailyDifference(previous,current) {
  if(!previous||previous.schemaVersion!==1||current.schemaVersion!==1||previous.prefix!==current.prefix||previous.db!==current.db||Date.parse(current.day+'T00:00:00Z')-Date.parse(previous.day+'T00:00:00Z')!==86400000) return Object.fromEntries(FAMILIES.map(f=>[f,missing('前日または対象不一致')]));
  return Object.fromEntries(FAMILIES.map(f=>{const a=previous.ledgers?.[f]?.current,b=current.ledgers?.[f]?.current;return [f,a?.status==='取得済み'&&b?.status==='取得済み'?known(b.value-a.value):missing('前日または当日未取得')];}));
}
module.exports={collect,dayAt,family,compareBaseline,dailyDifference};
