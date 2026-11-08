'use strict';
// Local-only content CAS. One MSET publishes work/season/SEO together after all checks.
const {createHash}=require('node:crypto');
const {keys}=require('./_dev-content-ledgers');
const COMMIT=`local n=#KEYS/2;local mode=ARGV[1];local values={}
for i=1,n do
 local p=2+3*(i-1);local raw=redis.call('GET',KEYS[2*i-1]);local meta=redis.call('GET',KEYS[2*i]);local revision=0
 if meta then revision=cjson.decode(meta).revision end
 if revision~=tonumber(ARGV[p]) then return {0,'version-conflict'} end
 local next=cjson.decode(ARGV[p+1]);local nextmeta=cjson.decode(ARGV[p+2]);if nextmeta.revision~=revision+1 then return {0,'invalid-version'} end
 if raw and string.find(KEYS[2*i-1],':legacy-work:v1:',1,true) and raw~=ARGV[p+1] then return {0,'legacy-copy-immutable'} end
 if raw and mode=='automatic' and string.find(KEYS[2*i-1],':work:v2:',1,true) then
  local old=cjson.decode(raw)
  if (old.confirmed or old.locked) and raw~=ARGV[p+1] then return {0,'confirmed-work'} end
  if old.lockedFields then for _,field in ipairs(old.lockedFields) do if cjson.encode(old[field])~=cjson.encode(next[field]) then return {0,'locked-field'} end end end
 end
 values[#values+1]=KEYS[2*i-1];values[#values+1]=ARGV[p+1];values[#values+1]=KEYS[2*i];values[#values+1]=ARGV[p+2]
end
redis.call('MSET',unpack(values));return {1,'saved'}`;
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
function contentStore(command){
 if(typeof command!=='function')throw Error('content command required');
 return {
  async read(names){if(!names.length)return {};names.forEach(validateKey);const values=await command(['MGET',...names.flatMap(k=>[k,k+':meta'])]);if(!Array.isArray(values)||values.length!==names.length*2)throw Error('invalid content batch');return Object.fromEntries(names.map((k,i)=>[k,{data:values[2*i]===null?null:JSON.parse(values[2*i]),meta:values[2*i+1]===null?{revision:0}:JSON.parse(values[2*i+1])}]))},
  async commit(entries,{mode='automatic'}={}){
   if(!['automatic','reviewed'].includes(mode)||!Array.isArray(entries)||!entries.length||entries.length>12||new Set(entries.map(e=>e.key)).size!==entries.length)throw Error('invalid content transaction');
   let bytes=0;const args=[mode];
   for(const e of entries){validateEntry(e.key,e.data);if(!Number.isSafeInteger(e.revision)||e.revision<0)throw Error('invalid expected revision');const json=JSON.stringify(e.data),meta=JSON.stringify({...e.meta,revision:e.revision+1});bytes+=Buffer.byteLength(json)+Buffer.byteLength(meta);args.push(String(e.revision),json,meta)}
   if(bytes>1024*1024)throw Error('content bundle too large; preserved old records');
   const result=await command(['EVAL',COMMIT,String(entries.length*2),...entries.flatMap(e=>[e.key,e.key+':meta']),...args]);
   return {saved:Number(result[0])===1,reason:result[1]};
  },keys
 };
}
module.exports={contentStore,digest,COMMIT};
