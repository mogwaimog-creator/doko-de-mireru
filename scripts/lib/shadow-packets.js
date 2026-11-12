'use strict';
// Two deliberately selected works, one credited person and one positive season.
// Private source packets are never a production seed or a claim about the full roster.
const works=[{type:'movie',id:635302},{type:'tv',id:85937}];
const MAX_REQUESTS=7,MAX_RESPONSE_BYTES=2*1024*1024,MAX_TOTAL_BYTES=8*1024*1024;
async function collect({apiKey,request=fetch,fixture=false}={}){
 if(!fixture&&(typeof apiKey!=='string'||apiKey.length<8))throw Error('TMDB_API_KEY is required; no request made');
 const packets=[],stats={requests:0,responseBytes:0};
 async function load(route,params={}){
  if(stats.requests>=MAX_REQUESTS)throw Error('shadow request limit');
  const url=new URL('https://api.themoviedb.org'+route);url.searchParams.set('language','ja-JP');
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  if(!fixture)url.searchParams.set('api_key',apiKey);
  stats.requests++;
  let data;
  try{
   const response=await request(url.toString(),{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(6500)});
   if(!response.ok||!response.body?.getReader)throw Error('response unavailable');
   const reader=response.body.getReader(),chunks=[];let bytes=0;
   try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;stats.responseBytes+=value.byteLength;if(bytes>MAX_RESPONSE_BYTES||stats.responseBytes>MAX_TOTAL_BYTES){await reader.cancel();throw Error('byte limit')}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
   data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('invalid JSON object');
  }catch{throw Error('Shadow TMDB collection stopped at '+route+'; no automatic retry')}
  packets.push({route,data});return data;
 }
 const fixed=[];
 for(const w of works){
  const raw=await load('/3/'+w.type+'/'+w.id,{append_to_response:'credits'});
  if(raw.id!==w.id||typeof raw[w.type==='movie'?'title':'name']!=='string'||!Array.isArray(raw.credits?.cast)||!Array.isArray(raw.credits?.crew)||!Array.isArray(raw.genres))throw Error('incomplete shadow work');
  fixed.push(raw);
  const providers=await load('/3/'+w.type+'/'+w.id+'/watch/providers');
  if(!providers.results||typeof providers.results!=='object'||Array.isArray(providers.results))throw Error('incomplete shadow providers');
  // Preserve JP absence as a successful zero result; do not import other territories.
  packets.at(-1).data={results:providers.results.JP===undefined?{}:{JP:providers.results.JP}};
 }
 const tv=fixed[1],personId=tv.credits.cast.find(p=>Number.isSafeInteger(p.id)&&p.id>0)?.id;
 const seasonNumber=tv.seasons?.find(s=>Number.isSafeInteger(s.season_number)&&s.season_number>0)?.season_number;
 if(!personId||!seasonNumber)throw Error('credited person and positive TV season required');
 const profile=await load('/3/person/'+personId),credits=await load('/3/person/'+personId+'/combined_credits');
 require('../../api/_content-source-adapters').personSource(personId,profile,credits);
 const episode=await load('/3/tv/'+tv.id+'/season/'+seasonNumber);
 require('../../api/_content-source-adapters').episodeSource(tv.id,seasonNumber,{tvId:tv.id,seasonNumber,data:episode});
 return {version:1,scope:fixture?'synthetic-shadow-fixtures':'selected-tmdb-shadow',capturedAt:new Date().toISOString(),works,personId,seasonNumber,packets,stats};
}
function replay(bundle){
 if(bundle?.version!==1||!['synthetic-shadow-fixtures','selected-tmdb-shadow'].includes(bundle.scope)||JSON.stringify(bundle.works)!==JSON.stringify(works)||!Number.isSafeInteger(bundle.personId)||bundle.personId<1||!Number.isSafeInteger(bundle.seasonNumber)||bundle.seasonNumber<1||!Array.isArray(bundle.packets)||bundle.packets.length!==MAX_REQUESTS)throw Error('invalid selected shadow bundle');
 const allowed=new Set([...works.flatMap(w=>['/3/'+w.type+'/'+w.id,'/3/'+w.type+'/'+w.id+'/watch/providers']),'/3/person/'+bundle.personId,'/3/person/'+bundle.personId+'/combined_credits','/3/tv/85937/season/'+bundle.seasonNumber]);
 const map=new Map();for(const p of bundle.packets){if(!allowed.has(p.route)||map.has(p.route)||!p.data||typeof p.data!=='object')throw Error('invalid shadow route');map.set(p.route,p.data)}
 return async route=>{if(!map.has(route))throw Error('Uncollected shadow route; live fallback disabled');return structuredClone(map.get(route))};
}
function fixtureRequest(url){
 const u=new URL(url),route=u.pathname,parts=route.split('/'),id=Number(parts[3]);let data;
 if(route.endsWith('/watch/providers'))data={results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix（模擬配信）',logo_path:null}],rent:[],buy:[]}}};
 else if(route.endsWith('/combined_credits'))data={id,cast:[{id:85937,media_type:'tv',name:'模擬TV作品',character:'voice',first_air_date:'2019-04-06'}],crew:[]};
 else if(parts[2]==='person')data={id,name:'隔離検証用の模擬人物',biography:'実人物の情報ではありません。'};
 else if(route.includes('/season/'))data={season_number:1,episodes:[{episode_number:1,name:'模擬エピソード',runtime:24}]};
 else data={id,title:'隔離検証用の模擬映画',name:'隔離検証用の模擬TV作品',original_title:'Shadow fixture movie',original_name:'Shadow fixture TV',overview:'ローカル検証用の人工データです。実作品・実配信の検証結果ではありません。',poster_path:null,release_date:'2020-10-16',first_air_date:'2019-04-06',runtime:117,episode_run_time:[24],genres:[{id:16,name:'アニメーション'}],status:'Ended',credits:{cast:[{id:900001,name:'隔離検証用の模擬人物'}],crew:[]},seasons:[{season_number:1,name:'模擬シーズン',episode_count:1,air_date:'2019-04-06'}]};
 return Promise.resolve(new Response(JSON.stringify(data)));
}
module.exports={works,collect,replay,fixtureRequest,MAX_REQUESTS,MAX_RESPONSE_BYTES,MAX_TOTAL_BYTES};
