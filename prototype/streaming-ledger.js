'use strict';
// Standalone Japanese streaming ledger. No production imports or network calls.
const VALID=new Set(['movie','tv']);
const KINDS=['flatrate','rent','buy'];
function key(type,id){const n=Number(id);if(!VALID.has(type)||!Number.isSafeInteger(n)||n<1)throw Error('invalid identity');return type+':'+n}
function iso(value){if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw Error('invalid timestamp');return new Date(value).toISOString()}
function providers(source){
 const out={};for(const kind of KINDS){
  const values=source?.[kind]||[];if(!Array.isArray(values))throw Error('invalid providers');
  const seen=new Set();out[kind]=[];
  for(const p of values){if(!p||typeof p!=='object')continue;const id=Number(p.providerId??p.provider_id);
   if(!Number.isSafeInteger(id)||id<1||seen.has(id))continue;
   seen.add(id);out[kind].push({providerId:id,name:String(p.name??p.provider_name??'').slice(0,100),logoPath:typeof(p.logoPath??p.logo_path)==='string'?String(p.logoPath??p.logo_path).slice(0,200):null});
  }
 }return out;
}
function store(io){
 const records=new Map();
 function get(type,id){return records.get(key(type,id))||null}
 function register(type,id){const k=key(type,id);if(records.has(k))return false;records.set(k,{type,id:Number(id),japan:{flatrate:[],rent:[],buy:[]},lastSuccessAt:null,nextEligibleAt:null,lastAttemptAt:null,errors:[]});return true}
 function eligible(type,id,at,isSeries){const r=get(type,id);if(!r)throw Error('not found');if(isSeries)return true;return !r.lastSuccessAt||Date.parse(at)>=Date.parse(r.nextEligibleAt)}
 function success(type,id,source,at){const r=get(type,id);if(!r)throw Error('not found');const when=iso(at);const jp=source?.JP??source?.jp??source;if(!jp||typeof jp!=='object')throw Error('missing Japan data');const normalized=providers(jp);r.japan=normalized;r.lastSuccessAt=when;r.lastAttemptAt=when;r.nextEligibleAt=new Date(Date.parse(when)+86400000).toISOString();return true}
 function failure(type,id,message,at){const r=get(type,id);if(!r)throw Error('not found');const msg=String(message??'').trim().slice(0,500);if(!msg)throw Error('empty error');r.lastAttemptAt=iso(at);const previous=r.errors.at(-1);if(previous?.message!==msg||previous?.status!=='open')r.errors.push({message:msg,status:'open',at:r.lastAttemptAt});return false}
 function resolve(type,id){const r=get(type,id);if(!r)throw Error('not found');for(const e of r.errors)if(e.status==='open')e.status='resolved'}
 function detail(type,id){const r=get(type,id);if(!r)return null;return JSON.parse(JSON.stringify({japan:r.japan,lastSuccessAt:r.lastSuccessAt,nextEligibleAt:r.nextEligibleAt,lastAttemptAt:r.lastAttemptAt}))}
 function watchOrder(type,id){const r=get(type,id);return r?r.japan.flatrate.map(p=>({...p})):null}
 function save(){const data=JSON.stringify({version:1,records:[...records.values()]});io?.write?.(data);return data}
 function load(data){const raw=JSON.parse(data??io?.read?.()??'{}');if(raw.version!==1||!Array.isArray(raw.records))throw Error('invalid ledger data');const next=new Map();for(const x of raw.records){const k=key(x.type,x.id);if(next.has(k))throw Error('duplicate');const normalized=providers(x.japan);const r={type:x.type,id:Number(x.id),japan:normalized,lastSuccessAt:x.lastSuccessAt?iso(x.lastSuccessAt):null,nextEligibleAt:x.nextEligibleAt?iso(x.nextEligibleAt):null,lastAttemptAt:x.lastAttemptAt?iso(x.lastAttemptAt):null,errors:Array.isArray(x.errors)?x.errors.filter(e=>typeof e.message==='string'&&['open','resolved'].includes(e.status)).map(e=>({message:e.message.slice(0,500),status:e.status,at:iso(e.at)})):[]};next.set(k,r)}records.clear();for(const [k,v] of next)records.set(k,v)}
 function audit(){const data=[...records.values()];return {count:data.length,totalBytes:Buffer.byteLength(JSON.stringify(data),'utf8'),errors:data.reduce((n,r)=>n+r.errors.filter(e=>e.status==='open').length,0),duplicates:data.length-new Set(data.map(r=>key(r.type,r.id))).size}}
 return {register,get,eligible,success,failure,resolve,detail,watchOrder,save,load,audit};
}
module.exports={store,key,providers};
