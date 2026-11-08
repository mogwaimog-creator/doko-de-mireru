'use strict';
const {createHash}=require('node:crypto');
const PREFIX='doko:dev:search:v2:',READY=PREFIX+'ready';
const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s・･.\-_'’]/g,'');
function document(key,data,{prefix=PREFIX}={}){
 if(!/^doko:dev:[a-z0-9:-]+:$/.test(prefix))throw Error('local search namespace required');
 let kind,id,names;if(key.includes(':work:v2:')){kind='work';id=data.type+':'+data.id;names=[data.title,data.originalTitle]}else if(key.includes(':person:v2:')){kind='person';id=String(data.person.id);names=[data.person.name,data.person.original_name]}else return null;
 const grams=new Set();for(const name of names){const chars=[...fold(name)];if(chars.length>512)throw Error('search name exceeds safe indexing limit');for(let i=0;i<chars.length;i++){grams.add(chars[i]);if(i+1<chars.length)grams.add(chars[i]+chars[i+1])}}
 const members=[...grams].map(g=>Buffer.from(g).toString('hex')+':'+id).sort();return {kind,id,docKey:prefix+'doc:'+kind+':'+id,registry:prefix+'ids:'+kind,index:prefix+'grams:'+kind,members};
}
// Index additions precede canonical MSET. Old members are removed only afterwards.
// Runtime failures can leave extra candidates; every candidate is checked against canonical data.
const PREPARE=`local old=redis.call('GET',KEYS[1]);for i=2,3 do local t=redis.call('TYPE',KEYS[i]).ok;if t~='none' and t~='zset' then return {err='invalid search index type'} end end;return old or false`;
const SEED=`if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
local doc=cjson.decode(ARGV[2]);for i=3,4 do local t=redis.call('TYPE',KEYS[i]).ok;if t~='none' and t~='zset' then return 0 end end
local old=redis.call('GET',KEYS[2]);redis.call('ZADD',KEYS[3],0,doc.id);local add={};for _,m in ipairs(doc.members) do add[#add+1]=0;add[#add+1]=m end;if #add>0 then redis.call('ZADD',KEYS[4],unpack(add)) end;redis.call('SET',KEYS[2],ARGV[2]);if old then local keep={};for _,m in ipairs(doc.members) do keep[m]=true end;local remove={};for _,m in ipairs(cjson.decode(old).members) do if not keep[m] then remove[#remove+1]=m end end;if #remove>0 then redis.call('ZREM',KEYS[4],unpack(remove)) end end;return 1`;
async function seed(command,key,raw,options){const data=JSON.parse(raw),doc=document(key,data,options);if(!doc)return false;return Number(await command(['EVAL',SEED,'4',key,doc.docKey,doc.registry,doc.index,raw,JSON.stringify(doc)]))===1}
const SELECT="local best=ARGV[1];local size=nil;for _,token in ipairs(ARGV) do local n=redis.call('ZLEXCOUNT',KEYS[1],'['..token..':','('..token..';');if size==nil or n<size then best=token;size=n end;if n==0 then break end end;return best";
async function candidates(command,query,{kind,type,page,cursor,prefix=PREFIX}){
 const normalized=fold(query),chars=[...normalized],grams=chars.length===1?[chars[0]]:chars.slice(0,-1).map((c,i)=>c+chars[i+1]),tokens=[...new Set(grams.map(g=>Buffer.from(g).toString('hex')))].slice(0,16),hash=createHash('sha256').update(JSON.stringify([normalized,kind,type])).digest('hex').slice(0,24),index=prefix+'grams:'+kind;
 let after=null,token;
 if(cursor){if(typeof cursor!=='string'||cursor.length>1024)throw Error('invalid search cursor');const decoded=JSON.parse(Buffer.from(cursor,'base64url').toString());token=decoded.after?.split(':')[0];if(decoded.hash!==hash||typeof decoded.after!=='string'||!tokens.includes(token)||!/^[a-f0-9]+:(?:(?:movie|tv):)?[1-9][0-9]*$/.test(decoded.after))throw Error('search cursor does not match query');after=decoded.after}
 else token=await command(['EVAL',SELECT,'1',index,...tokens]);
 if(!tokens.includes(token))throw Error('invalid search selector');return {hash,token,after,offset:cursor?0:(page-1)*20,index};
}
module.exports={PREFIX,READY,fold,document,seed,candidates,PREPARE,SELECT};
