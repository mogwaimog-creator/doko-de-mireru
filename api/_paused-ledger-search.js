'use strict';
// Read saved indexes only. No query-cache claims, upstream calls, or index repair.
const {indexedSearch,card,READ}=require('./_indexed-search');
const {PREFIX}=require('./_search-index-v2');
const {keys}=require('./_dev-content-ledgers');
const discovery=['popular','genreBrowse','advancedSearch','netflixNew','primeNew','unextNew','huluNew','disneyNew','provider','country','year','rating'];
const genres={suspense:[53,9648],action:[28,10759],comedy:[35],horror:[27],scifi:[878,14,10765],anime:[16],romance:[10749],drama:[18]};
const genreNames={suspense:/スリラー|ミステリー|サスペンス|thriller|mystery/i,action:/アクション|アドベンチャー|action|adventure/i,comedy:/コメディ|comedy/i,horror:/ホラー|horror/i,scifi:/SF|ファンタジー|science fiction|fantasy/i,anime:/アニメ|animation/i,romance:/ロマンス|恋愛|romance/i,drama:/ドラマ|drama/i};
const providers={netflix:8,prime:9,unext:84,hulu:15,disney:337};
function bad(message){return Object.assign(Error(message),{httpStatus:400})}
async function search(q,{command,clock=Date.now}){
 const type=q.type||'movie',query=String(q.personSearch||q.query||q.q||'').trim(),page=Number(q.page||q.genrePage||1);
 if(!Number.isSafeInteger(page)||page<1||page>20||!['movie','tv','all','anime','drama','person'].includes(type))throw bad('Invalid saved search');
 if(!discovery.some(k=>q[k])){
  if(!query||query.length>100||!require('./_search-index-v2').fold(query))throw bad('Invalid query');
  const kind=type==='person'||q.personSearch?'person':'work';
  const result=await indexedSearch(query,{kind,type,page,cursor:q.cursor,command});
  return kind==='work'?withSavedProviders(result,{command,clock,type}):result;
 }
 return browse(q,{command,clock,page,type});
}
async function withSavedProviders(result,{command,clock,type}){
 if(!result.results.length)return result;
 const works=result.results.map(row=>({type:['tv','tv_drama','anime_tv'].includes(row.content_type)?'tv':'movie',id:row.id}));
 let records;
 try{records=await require('./_shared-streaming-read').readMany(works,{command,now:clock()})}
 catch{return result} // Optional provider storage must not prevent title search.
 const results=result.results.map((row,i)=>{
  const saved=records[works[i].type+':'+row.id],jp=saved?.detail?.data?.results?.JP||{};
  return {...row,streaming:jp.flatrate||saved?.watch?.flatrate||[],rental:jp.rent||[],purchase:jp.buy||[]};
 });
 return {...result,results,...(type==='anime'?{tvAnime:results.filter(r=>r.content_type==='anime_tv'),animeMovies:results.filter(r=>r.content_type==='anime_movie')}: {})};
}
async function browse(q,{command,clock,page,type}){
 const popular=q.popular==='1',newReleases=Object.keys(providers).some(p=>q[p+'New']==='1'),limit=popular?5:newReleases?10:20,results=[];
 const selectedProvider=q.provider||Object.keys(providers).find(p=>q[p+'New']==='1');
 const providerId=selectedProvider?(providers[selectedProvider]||Number(selectedProvider)):null;
 if(selectedProvider&&(!Number.isSafeInteger(providerId)||providerId<1))throw bad('Invalid saved provider');
 if(q.genre&&!genres[q.genre])throw bad('Invalid saved genre');
 // Compact work v2 does not retain country/language. Do not mislabel unrelated works.
 if(q.country)return {results:[],page,hasMore:false,scope:'saved-only',unavailableFilters:['country']};
 const browseType=q.netflixType||q.primeType||q.unextType||q.huluType||q.disneyType||(q.genreBrowse||popular?'all':type);
 if(!['movie','tv','all','anime','drama'].includes(browseType))throw bad('Invalid saved type');
 let offset=0,skip=(page-1)*limit,more=false;
 // A popular panel is bounded to 32 indexed candidates. Browsing scans at most 512.
 const maxScan=popular?32:512;
 while(offset<maxScan&&results.length<limit){
  const refs=await command(['ZRANGE',PREFIX+'ids:work',String(offset),String(offset+31)]);
  if(!Array.isArray(refs)||refs.length>32||refs.some(r=>!/^(movie|tv):[1-9][0-9]*$/.test(r)))throw Error('invalid saved registry');
  if(!refs.length){more=false;break}
  const raws=await command(['EVAL',READ,String(refs.length),...refs.map(r=>{const [t,id]=r.split(':');return keys.work(t,id)})]);
  if(!Array.isArray(raws)||!raws.length||raws.length>refs.length)throw Error('invalid saved browse records');
  let streams=null;
  if(providerId){streams=await command(['MGET',...refs.slice(0,raws.length).map(r=>'doko:dev:shared-stream:v1:record:'+r)]);if(!Array.isArray(streams)||streams.length!==raws.length)throw Error('invalid saved providers')}
  const batch=[];
  for(let i=0;i<raws.length;i++){
   if(raws[i]===null||raws[i]===false)continue;
   const row=JSON.parse(raws[i]),[t,id]=refs[i].split(':'),item=card('work',{type:t,id:Number(id)},row,'',popular?'movie':browseType);
   if(!item)continue;
   if(q.genre&&!(row.genres||[]).some(g=>genres[q.genre].includes(g?.id)||genreNames[q.genre].test(typeof g==='string'?g:g?.name||'')))continue;
   if(newReleases){const release=Date.parse(row.releaseDate);if(!Number.isFinite(release)||release>clock()||release<clock()-90*86400000)continue}
   if(q.rating&&Number(row.rating||0)<Number(q.rating))continue;
   const year=Number(String(row.releaseDate||'').slice(0,4)),start=Number(q.year);
   if(q.year&&(!year||(start===1980?year>1989:year<start||year>start+9)))continue;
   if(providerId){let raw;try{raw=JSON.parse(streams[i])}catch{continue}const saved=require('./_shared-streaming-read').compatible(raw,t,Number(id),clock());if(!saved?.watch?.flatrate?.some(p=>(p.provider_id??p.id)===providerId))continue}
   batch.push(item);
  }
  if(popular)batch.sort((a,b)=>b.vote_average-a.vote_average||b.release_date.localeCompare(a.release_date)||a.id-b.id);
  for(const item of batch){if(skip){skip--;continue}results.push(item);if(results.length===limit)break}
  offset+=raws.length;more=results.length===limit||raws.length<refs.length||refs.length===32;
  if(!more)break;
 }
 if(newReleases)results.sort((a,b)=>b.release_date.localeCompare(a.release_date)||a.id-b.id);
 const today=new Date(clock()+9*3600000).toISOString().slice(0,10);
 return {results:results.map(item=>popular?{...item,popularity:0,status:item.release_date>today?item.release_date.replace(/-/g,'/')+' 公開予定':'公開済み',status_type:item.release_date>today?'coming':'planned'}:item),page,hasMore:popular?false:page<20&&more,scope:'saved-only',incomplete:more&&offset>=maxScan,...(browseType==='anime'?{tvAnime:results.filter(r=>r.content_type==='anime_tv'),animeMovies:results.filter(r=>r.content_type==='anime_movie')}: {})};
}
module.exports={search};
