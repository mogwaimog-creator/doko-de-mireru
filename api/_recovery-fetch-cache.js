'use strict';
// Issue #19 local recovery experiment: bounded query slots, lazy fixed content.
const {createHash,randomUUID}=require('node:crypto');
const CLAIM="local c=redis.call('GET',KEYS[3]);local raw=redis.call('GET',KEYS[1]);if raw and cjson.decode(raw).identity==ARGV[2] then return {1,raw} end;if c and cjson.decode(c).status~='ready' then return {0,'paused'} end;if ARGV[3]=='content' and tonumber(redis.call('GET',KEYS[4]) or '0')>=20709376 then return {0,'capacity'} end;if redis.call('SET',KEYS[2],ARGV[1],'NX','PX',15000) then return {2,false} end;return {0,'busy'}";
const SAVE="if redis.call('GET',KEYS[2])~=ARGV[1] then return 0 end;local c=redis.call('GET',KEYS[3]);if c and cjson.decode(c).status~='ready' then return 0 end;if ARGV[4]=='content' then local n=tonumber(redis.call('GET',KEYS[4]) or '0');if n+string.len(ARGV[2])>20971520 then return -1 end;redis.call('INCRBY',KEYS[4],string.len(ARGV[2]));redis.call('SET',KEYS[1],ARGV[2]) else redis.call('SET',KEYS[1],ARGV[2],'PX',ARGV[3]) end;redis.call('DEL',KEYS[2]);return 1";
const RELEASE="if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end";
function enabled(){return process.env.DEV_LEAN_SERIES_ENABLED==='1'&&process.env.NODE_ENV!=='production'&&process.env.VERCEL_ENV!=='production'}
function cache(command,{prefix='doko:dev:recovery:v1:',controlKey='doko:dev:content-control:v1'}={}){
 if(!/^doko:dev:[a-z0-9:-]+:$/.test(prefix)||!/^doko:dev:[a-z0-9:-]+$/.test(controlKey))throw Error('local cache required');
 return {async load(url,load){const parsed=new URL(url),path=parsed.pathname;if(parsed.hostname!=='api.themoviedb.org'||parsed.protocol!=='https:')throw Error('unexpected metadata source');const isQuery=/^\/3\/(?:search\/(movie|tv|person|multi)|discover\/(movie|tv)|watch\/providers\/(movie|tv)|(?:movie|tv)\/(?:now_playing|upcoming|popular|top_rated)|trending\/(movie|tv|all)\/(day|week))$/.test(path),isContent=/^\/3\/(movie|tv|person)\/[1-9][0-9]*(?:\/season\/[0-9]+|\/combined_credits)?$/.test(path);
 if(!isQuery&&!isContent)return load();parsed.searchParams.delete('api_key');parsed.searchParams.sort();const identity=parsed.pathname+'?'+parsed.searchParams.toString(),digest=createHash('sha256').update(identity).digest('hex'),key=prefix+(isQuery?'query:'+parseInt(digest.slice(0,8),16)%64:'content:'+digest),lock=key+':lock',token=randomUUID();
 let result=await command(['EVAL',CLAIM,'4',key,lock,controlKey,prefix+'content-bytes',token,identity,isQuery?'query':'content']);
 // A concurrent request may already be filling the same bounded cache slot.
 // Wait briefly for its result instead of treating a transient lock as a storage failure.
 // Never bypass the lock or make a duplicate upstream request.
 for(let retry=0;Number(result[0])===0&&result[1]==='busy'&&retry<4;retry++){
  await new Promise(resolve=>setTimeout(resolve,250));
  result=await command(['EVAL',CLAIM,'4',key,lock,controlKey,prefix+'content-bytes',token,identity,isQuery?'query':'content']);
 }if(Number(result[0])===1){const saved=JSON.parse(result[1]);if(saved.identity!==identity)throw Error('cache identity mismatch');return saved.data}
 if(Number(result[0])!==2){if(isQuery&&['busy','capacity'].includes(String(result[1])))return load();throw Error('metadata storage '+result[1]);}
 try{const data=await load();if(isQuery&&!Array.isArray(data?.results))throw Error('invalid search results');if(isContent){const match=path.match(/^\/3\/(movie|tv|person)\/([1-9][0-9]*)/);if(Number(data?.id)!==Number(match[2])&&!/\/season\/|\/combined_credits$/.test(path))throw Error('source identity mismatch');if(/\/combined_credits$/.test(path)&&(!Array.isArray(data?.cast)||!Array.isArray(data?.crew)))throw Error('invalid credits');if(/\/season\//.test(path)&&Number(data?.season_number)!==Number(path.split('/').at(-1)))throw Error('season identity mismatch')}
 const fixed=isContent&&Object.hasOwn(data,'watch/providers')?Object.fromEntries(Object.entries(data).filter(([key])=>key!=='watch/providers')):data;const raw=JSON.stringify({identity,data:fixed});if(Buffer.byteLength(raw)> (isQuery?32768:262144))return data;const saved=Number(await command(['EVAL',SAVE,'4',key,lock,controlKey,prefix+'content-bytes',token,raw,'3600000',isQuery?'query':'content']));if(saved===0)throw Error('metadata save fenced');if(saved===-1)throw Error('metadata capacity stop');return data;
 }finally{await command(['EVAL',RELEASE,'1',lock,token])}
 }};
}
async function devCommand(args){const base=new URL(process.env.SHARED_LEDGER_DEV_URL||'http://127.0.0.1:16380');if(!enabled()||base.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(base.hostname)||base.username||base.password)throw Error('local recovery bridge required');base.pathname='/recovery-cache';base.search='';base.hash='';const result=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(1500)});if(!result.ok)throw Error('recovery cache unavailable');const body=await result.json();if(body.error)throw Error('recovery cache rejected');return body.result}
module.exports={cache,enabled,devCommand,CLAIM,SAVE,RELEASE};
