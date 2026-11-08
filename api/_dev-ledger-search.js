'use strict';
// Saved-only search. Catalog stores identities, never duplicate profile/work text.
const {enabled,keys}=require('./_dev-content-ledgers');
const {devCommand}=require('./_shared-streaming-read');
const CATALOG='doko:dev:search:v1:catalog';
const fold=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/[\s・･.\-_'’]/g,'');
async function search(query,{kind='work',type='movie',page=1,command=devCommand}={}){
 if(!enabled())return null;
 if(!['person','work'].includes(kind)||!['movie','tv','all','anime','drama'].includes(type)||!Number.isSafeInteger(page)||page<1||page>1000||!fold(query)||String(query).length>200)throw Error('invalid saved search');
 const fail=()=>{const e=Error('Saved search catalog unavailable');e.code='WORK_METADATA_INCOMPLETE';return e};
 const raw=await command(['GET',CATALOG]);if(raw===null)throw fail();const catalog=JSON.parse(raw);
 if(catalog.schemaVersion!==1||!Array.isArray(catalog.works)||!Array.isArray(catalog.people)||catalog.works.length+catalog.people.length>1000)throw fail();
 const refs=kind==='person'?catalog.people.map(id=>({id,key:keys.person(id)})):catalog.works.filter(w=>type==='all'||w.type===(['tv','anime','drama'].includes(type)?'tv':'movie')).map(w=>({...w,key:keys.work(w.type,w.id)}));
 if(new Set(refs.map(w=>w.key)).size!==refs.length)throw fail();
 const values=refs.length?await command(['MGET',...refs.map(w=>w.key)]):[];if(!Array.isArray(values)||values.length!==refs.length)throw fail();
 const needle=fold(query),results=[];let missing=0;
 for(let i=0;i<refs.length;i++){
  if(values[i]===null){missing++;continue}const row=JSON.parse(values[i]),ref=refs[i];
  if(kind==='person'){
   require('../prototype/person-ledger').validateRecord(row);if(row.person.id!==Number(ref.id))throw fail();const p=row.person;
   if(![p.name,p.original_name].some(x=>fold(x).includes(needle)))continue;
   results.push({id:p.id,name:p.name,profile_path:p.profile_path,known_for_department:p.known_for_department,known_for:[...p.cast,...p.voice,...p.directed].slice(0,3)});
  }else{
   if(row.schemaVersion!==2||row.id!==Number(ref.id)||row.type!==ref.type)throw fail();
   const anime=(row.genres||[]).some(g=>/アニメ|animation/i.test(g));if(type==='anime'&&!anime)continue;if(type==='drama'&&(anime||!row.genres?.length))continue;
   if(![row.title,row.originalTitle].some(x=>fold(x).includes(needle)))continue;
   results.push({id:row.id,title:row.title,original_title:row.originalTitle||'',poster_path:row.posterPath,overview:row.overview||'',release_date:row.releaseDate||'',date:row.releaseDate||'',vote_average:row.rating||0,content_type:row.type==='tv'?(anime?'anime_tv':'tv_drama'):'movie',media_type:row.type==='tv'?'TVシリーズ':'映画'});
  }
 }
 results.sort((a,b)=>(a.title||a.name).localeCompare(b.title||b.name,'ja')||a.id-b.id);const offset=(page-1)*20;
 return {results:results.slice(offset,offset+20),page,hasMore:offset+20<results.length,total:results.length,scope:'saved-only',incomplete:missing>0};
}
module.exports={search,CATALOG};
