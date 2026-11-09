'use strict';
// Local-only content CAS. One MSET publishes work/season/SEO together after all checks.
const {createHash}=require('node:crypto');
const {keys}=require('./_dev-content-ledgers');
const COMMIT=`local gated=0;if ARGV[1]=='automatic-ready' then gated=1;local c=redis.call('GET',KEYS[#KEYS]);if c and cjson.decode(c).status~='ready' then return {0,'paused'} end end
local extra=0;if ARGV[2]~='' then extra=1;if redis.call('GET',KEYS[#KEYS-gated])~=ARGV[2] or redis.call('PTTL',KEYS[#KEYS-gated])<=0 then return {0,'lease-lost'} end end
local n=(#KEYS-extra-gated)/5;local mode=ARGV[1];if gated==1 then mode='automatic' end;local values={};local indexed={}
for i=1,n do
 local p=3+4*(i-1);local raw=redis.call('GET',KEYS[5*i-4]);local meta=redis.call('GET',KEYS[5*i-3]);local revision=0
 if meta then revision=cjson.decode(meta).revision end
 if revision~=tonumber(ARGV[p]) then return {0,'version-conflict'} end
 local next=cjson.decode(ARGV[p+1]);local nextmeta=cjson.decode(ARGV[p+2]);if nextmeta.revision~=revision+1 then return {0,'invalid-version'} end
 if raw and string.find(KEYS[5*i-4],':legacy-work:v1:',1,true) and raw~=ARGV[p+1] then return {0,'legacy-copy-immutable'} end
 if raw and mode=='automatic' and string.find(KEYS[5*i-4],':work:v2:',1,true) then
  local old=cjson.decode(raw)
  if (old.confirmed or old.locked) and raw~=ARGV[p+1] then return {0,'confirmed-work'} end
  if old.lockedFields then for _,field in ipairs(old.lockedFields) do if cjson.encode(old[field])~=cjson.encode(next[field]) then return {0,'locked-field'} end end end
 end
 if ARGV[p+3]~='' then local doc=cjson.decode(ARGV[p+3]);local old=redis.call('GET',KEYS[5*i-2]);if old then local prior=cjson.decode(old);if prior.kind~=doc.kind or prior.id~=doc.id or type(prior.members)~='table' then return {0,'invalid-index-document'} end end;for j=5*i-1,5*i do local t=redis.call('TYPE',KEYS[j]).ok;if t~='none' and t~='zset' then return {0,'invalid-index-type'} end end;indexed[#indexed+1]={doc=doc,old=old,docKey=KEYS[5*i-2],registry=KEYS[5*i-1],index=KEYS[5*i],raw=ARGV[p+3]} end
 values[#values+1]=KEYS[5*i-4];values[#values+1]=ARGV[p+1];values[#values+1]=KEYS[5*i-3];values[#values+1]=ARGV[p+2]
end
for _,item in ipairs(indexed) do redis.call('ZADD',item.registry,0,item.doc.id);local add={};for _,m in ipairs(item.doc.members) do add[#add+1]=0;add[#add+1]=m end;if #add>0 then redis.call('ZADD',item.index,unpack(add)) end;values[#values+1]=item.docKey;values[#values+1]=item.raw end
redis.call('MSET',unpack(values));
for _,item in ipairs(indexed) do if item.old then local keep={};for _,m in ipairs(item.doc.members) do keep[m]=true end;local remove={};for _,m in ipairs(cjson.decode(item.old).members) do if not keep[m] then remove[#remove+1]=m end end;if #remove>0 then redis.call('ZREM',item.index,unpack(remove)) end end end;return {1,'saved'}`;
const CLAIM_LEASE="local control=redis.call('GET',KEYS[1]);if control and cjson.decode(control).status~='ready' then return 0 end;if redis.call('SET',KEYS[2],ARGV[1],'NX','PX',ARGV[2]) then return 1 else return 0 end";
const RELEASE_LEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
const CIRCUIT_PAUSE="local old=redis.call('GET',KEYS[1]);local revision=0;if old then local value=cjson.decode(old);if value.status=='paused' then return 0 end;revision=value.revision or 0 end;local tail=',\"revision\":'..tostring(revision+1);if old then local prior=cjson.decode(old);for _,name in ipairs({'newWorkDailyLimit','newWorkAcquisitionPaused'}) do if prior[name]~=nil then tail=tail..','..cjson.encode(name)..':'..cjson.encode(prior[name]) end end end;redis.call('SET',KEYS[1],string.sub(ARGV[1],1,-2)..tail..'}');return 1";
const NOTE_FAILURE="if redis.call('GET',KEYS[1])~=ARGV[1] or redis.call('PTTL',KEYS[1])<=0 then return 0 end;local raw=redis.call('GET',KEYS[2]);local v=0;if raw then v=cjson.decode(raw).revision end;if v~=tonumber(ARGV[2]) then return 0 end;redis.call('SET',KEYS[2],ARGV[3]);return 1";
function digest(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex')}
function validateKey(k){if(!/^doko:dev:(?:(?:work:v2|seo:v1|legacy-work:v1):(movie|tv):[1-9][0-9]*|person:v2:[1-9][0-9]*|season:v1:tv:[1-9][0-9]*)$/.test(k))throw Error('development content key required');return k}
function validateEntry(k,data){
 validateKey(k);if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid content');
 if(k.includes(':work:v2:')){
  const [type,id]=k.split(':').slice(-2);if(data.schemaVersion!==2||data.type!==type||data.id!==Number(id)||typeof data.title!=='string'||!data.title.trim())throw Error('invalid work identity');
  if(data.lockedFields!==undefined&&!Array.isArray(data.lockedFields))throw Error('invalid field locks');
  if(data.confirmed&&data.errors?.some(e=>e.status==='open'))throw Error('unresolved work errors');
 }else if(k.includes(':legacy-work:v1:')){const [type,id]=k.split(':').slice(-2);if(data.schemaVersion!==1||data.type!==type||data.id!==Number(id))throw Error('invalid legacy work identity')}else if(k.includes(':person:v2:')){require('../prototype/person-ledger').validateRecord(data);if(data.person.id!==Number(k.split(':').at(-1)))throw Error('invalid person identity')}
 else if(k.includes(':season:v1:')){require('../prototype/season-ledger').validate(data);if(data.tvId!==Number(k.split(':').at(-1)))throw Error('invalid season identity')}
 else if(k.includes(':seo:v1:')){require('../prototype/seo-ledger').validateSeoRecord(data);if(data.key!==k.split(':').slice(-2).join(':'))throw Error('invalid SEO identity')}
}
function contentStore(command,{controlKey='doko:dev:content-control:v1'}={}){
 if(typeof command!=='function'||!/^doko:dev:[a-z0-9:-]+$/.test(controlKey))throw Error('local content command/control required');
 const transport=command;command=async args=>{try{return await transport(args)}catch(cause){const error=Error('Content storage unavailable');error.code='CONTENT_STORAGE_UNAVAILABLE';error.cause=cause;throw error}};
 return {
  async read(names){if(!names.length)return {};names.forEach(validateKey);const values=await command(['MGET',...names.flatMap(k=>[k,k+':meta'])]);if(!Array.isArray(values)||values.length!==names.length*2)throw Error('invalid content batch');return Object.fromEntries(names.map((k,i)=>[k,{data:values[2*i]===null?null:JSON.parse(values[2*i]),meta:values[2*i+1]===null?{revision:0}:JSON.parse(values[2*i+1])}]))},
  async commit(entries,{mode='automatic',lease=null,requireReady=false}={}){
   if(!['automatic','reviewed'].includes(mode)||!Array.isArray(entries)||!entries.length||entries.length>12||new Set(entries.map(e=>e.key)).size!==entries.length)throw Error('invalid content transaction');
   let bytes=0;const indexDocs=[];if(requireReady&&mode!=='automatic')throw Error('ready gate requires automatic mode');const args=[requireReady?'automatic-ready':mode,lease?.token||''];if(lease){validateKey(lease.key);if(!entries.some(e=>e.key===lease.key))throw Error('lease key outside transaction');}
   for(const e of entries){validateEntry(e.key,e.data);if(!Number.isSafeInteger(e.revision)||e.revision<0)throw Error('invalid expected revision');const json=JSON.stringify(e.data),meta=JSON.stringify({...e.meta,revision:e.revision+1});bytes+=Buffer.byteLength(json)+Buffer.byteLength(meta);const index=require('./_search-index-v2').document(e.key,e.data);indexDocs.push(index);const indexJson=index?JSON.stringify(index):'';bytes+=Buffer.byteLength(indexJson);args.push(String(e.revision),json,meta,indexJson)}
   if(bytes>1024*1024)throw Error('content bundle too large; preserved old records');
   const result=await command(['EVAL',COMMIT,String(entries.length*5+(lease?1:0)+(requireReady?1:0)),...entries.flatMap((e,i)=>[e.key,e.key+':meta',...(indexDocs[i]?[indexDocs[i].docKey,indexDocs[i].registry,indexDocs[i].index]:Array(3).fill('doko:dev:search:v2:unused'))]),...(lease?[lease.key+':lease']:[]),...(requireReady?[controlKey]:[]),...args]);
   if(String(result[1]).startsWith('invalid-index')){const error=Error('Search index requires repair');error.code='CONTENT_STORAGE_UNAVAILABLE';throw error}
   return {saved:Number(result[0])===1,reason:result[1]};
  },
  async claimLease(key,token,ttlMs){validateKey(key);if(!token||!Number.isSafeInteger(ttlMs)||ttlMs<1)throw Error('invalid content lease');return Number(await command(['EVAL',CLAIM_LEASE,'2',controlKey,key+':lease',token,String(ttlMs)]))===1},
  async tripCircuit(error,{key}={}){if(key)validateKey(key);await command(['EVAL',CIRCUIT_PAUSE,'1',controlKey,JSON.stringify({status:'paused',affectedKeys:key?[key]:[],reason:String(error.message||error).slice(0,300),at:new Date().toISOString()})])},
  async readControl(){const raw=await command(['GET',controlKey]);return raw===null?null:JSON.parse(raw)},
  async releaseLease(key,token){validateKey(key);return Number(await command(['EVAL',RELEASE_LEASE,'1',key+':lease',token]))===1},
  async noteFailure(key,revision,meta,lease){validateKey(key);const json=JSON.stringify({...meta,revision:revision+1});return Number(await command(['EVAL',NOTE_FAILURE,'2',key+':lease',key+':meta',lease?.token||'',String(revision),json]))===1},keys
 };
}
module.exports={contentStore,digest,COMMIT,CLAIM_LEASE,RELEASE_LEASE,CIRCUIT_PAUSE,NOTE_FAILURE};
