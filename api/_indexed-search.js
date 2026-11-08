'use strict';
const idx=require('./_search-index-v2'),{keys}=require('./_dev-content-ledgers');
function card(kind,ref,row,needle,type){
 if(kind==='person'){require('../prototype/person-ledger').validateRecord(row);if(row.person.id!==Number(ref.id))throw Error('indexed person identity mismatch');const p=row.person;if(![p.name,p.original_name].some(x=>idx.fold(x).includes(needle)))return null;return {id:p.id,name:p.name,profile_path:p.profile_path,known_for_department:p.known_for_department,known_for:[...p.cast,...p.voice,...p.directed].slice(0,3)}}
 if(row.schemaVersion!==2||row.id!==Number(ref.id)||row.type!==ref.type)throw Error('indexed work identity mismatch');
 const anime=(row.genres||[]).some(g=>/アニメ|animation/i.test(g));if(type==='movie'&&row.type!=='movie')return null;if(['tv','drama'].includes(type)&&row.type!=='tv')return null;if(type==='anime'&&!anime)return null;if(type==='drama'&&(anime||!row.genres?.length))return null;
 if(![row.title,row.originalTitle].some(x=>idx.fold(x).includes(needle)))return null;
 return {id:row.id,title:row.title,original_title:row.originalTitle||'',poster_path:row.posterPath,overview:row.overview||'',release_date:row.releaseDate||'',date:row.releaseDate||'',vote_average:row.rating||0,content_type:row.type==='tv'?(anime?'anime_tv':'tv_drama'):'movie',media_type:row.type==='tv'?'TVシリーズ':'映画'};
}
const READ="local out={};local bytes=0;for _,key in ipairs(KEYS) do local n=redis.call('STRLEN',key);if n>1048576 then return {err='canonical search record exceeds bound'} end;if #out>0 and bytes+n>524288 then break end;bytes=bytes+n;out[#out+1]=redis.call('GET',key) or false end;return out";
async function indexedSearch(query,{kind,type,page,cursor,command,prefix}){
 const plan=await idx.candidates(command,query,{kind,type,page,cursor,prefix}),results=[];let after=plan.after,scanned=0,scannedBytes=0,missing=0,hasMore=false,skip=plan.offset;
 if(skip>500&&!cursor)throw Error('cursor required for deep saved search');
 while(scanned<512&&scannedBytes<2*1024*1024&&results.length<20){
  const members=await command(['ZRANGEBYLEX',plan.index,after?'('+after:'['+plan.token+':','('+plan.token+';','LIMIT','0',String(Math.min(32,512-scanned))]);if(!Array.isArray(members))throw Error('invalid index page');if(!members.length){hasMore=false;break}
  const refs=members.map(m=>{const id=m.slice(plan.token.length+1);if(kind==='person')return {id:Number(id),key:keys.person(id)};const [type,idText]=id.split(':');return {type,id:Number(idText),key:keys.work(type,idText)}});
  const raws=await command(['EVAL',READ,String(refs.length),...refs.map(r=>r.key)]);if(!Array.isArray(raws)||!raws.length||raws.length>refs.length)throw Error('invalid canonical search page');
  scannedBytes+=raws.reduce((n,raw)=>n+(raw===null?0:Buffer.byteLength(raw)),0);
  for(let i=0;i<raws.length;i++){after=members[i];scanned++;if(raws[i]===null){missing++;continue}const item=card(kind,refs[i],JSON.parse(raws[i]),idx.fold(query),type);if(!item)continue;if(skip){skip--;continue}results.push(item);if(results.length===20)break}
  hasMore=results.length===20||members.length===32||raws.length<members.length;if(members.length<32&&raws.length===members.length&&results.length<20){hasMore=false;break}
 }
 const nextCursor=hasMore?Buffer.from(JSON.stringify({hash:plan.hash,after})).toString('base64url'):null;
 return {results,page,hasMore,nextCursor,scope:'saved-only',incomplete:missing>0||((scanned>=512||scannedBytes>=2*1024*1024)&&hasMore),scanned,scannedBytes,...(type==='anime'?{tvAnime:results.filter(r=>r.content_type==='anime_tv'),animeMovies:results.filter(r=>r.content_type==='movie')}:{} )};
}
module.exports={indexedSearch,card,READ};
