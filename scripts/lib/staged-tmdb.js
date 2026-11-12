'use strict';
// Explicit roster only. Each successful response is checkpointed before the next request.
const fs=require('node:fs'),path=require('node:path');
const {roster}=require('./cutover/package');
const ids=new Set(roster.map(w=>w.type+':'+w.id));
function privateDirectory(dir){const root=fs.realpathSync(path.join(__dirname,'../..'));fs.mkdirSync(dir,{recursive:true,mode:0o700});dir=fs.realpathSync(dir);if(dir===root||dir.startsWith(root+path.sep))throw Error('private data must stay outside repository');fs.chmodSync(dir,0o700);return dir}
function packetStore(dir){dir=privateDirectory(dir);const folder=path.join(dir,'packets');fs.mkdirSync(folder,{mode:0o700,recursive:true});const file=route=>path.join(folder,Buffer.from(route).toString('hex')+'.json');return {
 get(route){const p=file(route);return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):null},
 put(route,data,capturedAt=new Date().toISOString()){const p=file(route);if(fs.existsSync(p))return;fs.writeFileSync(p,JSON.stringify({route,data,capturedAt})+'\n',{flag:'wx',mode:0o600})},
 all(){return fs.readdirSync(folder).filter(f=>f.endsWith('.json')).map(f=>JSON.parse(fs.readFileSync(path.join(folder,f),'utf8')))},dir};}
function routeAllowed(route,store){
 let m=route.match(/^\/3\/(movie|tv)\/(\d+)(\/watch\/providers)?$/);if(m)return ids.has(m[1]+':'+Number(m[2]));
 m=route.match(/^\/3\/tv\/(\d+)\/season\/(\d+)$/);if(m){const raw=store.get('/3/tv/'+Number(m[1]))?.data;return ids.has('tv:'+Number(m[1]))&&Number(m[2])>0&&raw?.seasons?.some(s=>s.season_number===Number(m[2]))}
 m=route.match(/^\/3\/person\/(\d+)(\/combined_credits)?$/);if(m)return store.all().some(p=>/^\/3\/(movie|tv)\/\d+$/.test(p.route)&&p.data.credits?.cast?.some(c=>c.id===Number(m[1])));return false;
}
function collector(store,{apiKey,request=fetch,maxRequests=52,maxTotalBytes=32*1024*1024,spacingMs=350}={}){
 if(typeof apiKey!=='string'||apiKey.length<8||!Number.isSafeInteger(maxRequests)||maxRequests<1||maxRequests>100||spacingMs<0)throw Error('bounded existing TMDB access required');
 const stats={requests:0,responseBytes:0,reused:0,requestMs:[]};let previous=0,stopped=false;
 async function load(route){const prior=store.get(route);if(prior){stats.reused++;return prior.data}if(stopped||!routeAllowed(route,store)||stats.requests>=maxRequests)throw Error('TMDB scope/budget stopped');
  const wait=spacingMs-(Date.now()-previous);if(wait>0)await new Promise(r=>setTimeout(r,wait));previous=Date.now();stats.requests++;const at=performance.now();
  try{const url=new URL('https://api.themoviedb.org'+route);url.searchParams.set('api_key',apiKey);url.searchParams.set('language','ja-JP');if(/^\/3\/(movie|tv)\/\d+$/.test(route))url.searchParams.set('append_to_response','credits');
   const r=await request(url.toString(),{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});if(!r.ok||!r.body?.getReader)throw Error('upstream response unavailable');const reader=r.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;stats.responseBytes+=value.byteLength;if(size>2*1024*1024||stats.responseBytes>maxTotalBytes){await reader.cancel();throw Error('response byte limit')}chunks.push(Buffer.from(value))}}finally{reader.releaseLock()}
   let data=JSON.parse(Buffer.concat(chunks).toString('utf8'));validate(route,data);
   if(route.endsWith('/watch/providers'))data={results:data.results.JP===undefined?{}:{JP:data.results.JP}};
   store.put(route,data);stats.requestMs.push(Math.round(performance.now()-at));return data;
  }catch{stopped=true;throw Error('TMDB stopped at '+route+'; successful packets retained; no automatic retry')}
 }
 return {load,stats};
}
function validate(route,data){
 const m=route.match(/^\/3\/(movie|tv)\/(\d+)$/);
 if(m){require('../../api/_new-work-ingest').canonical(m[1],Number(m[2]),data);if(!Array.isArray(data.credits?.cast)||!Array.isArray(data.credits?.crew)||!Array.isArray(data.genres)||m[1]==='tv'&&!Array.isArray(data.seasons))throw Error('incomplete fixed source')}
 else if(route.endsWith('/watch/providers')){if(!data?.results||Array.isArray(data.results)||typeof data.results!=='object')throw Error('invalid providers');const jp=data.results.JP;if(jp!==undefined&&(!jp||typeof jp!=='object'||['flatrate','rent','buy'].some(k=>jp[k]!==undefined&&!Array.isArray(jp[k]))))throw Error('invalid JP providers')}
 else if(route.includes('/season/')){const p=route.split('/');require('../../api/_content-source-adapters').episodeSource(Number(p[3]),Number(p[5]),{tvId:Number(p[3]),seasonNumber:Number(p[5]),data})}
 else if(route.endsWith('/combined_credits')){if(data?.id!==Number(route.split('/')[3])||!Array.isArray(data.cast)||!Array.isArray(data.crew))throw Error('invalid credits')}
 else if(data?.id!==Number(route.split('/')[3])||typeof data.name!=='string')throw Error('invalid profile');
}
function importShadow(store,bundle){require('./shadow-packets').replay(bundle);if(bundle.scope!=='selected-tmdb-shadow')throw Error('real packets required');for(const p of bundle.packets){validate(p.route,p.data);store.put(p.route,p.data,bundle.capturedAt)}}
async function collectBatch(store,source,{limit=8,samplePerson=false}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>16)throw Error('batch must contain 1..16 works');
 const todo=roster.filter(w=>!store.get('/3/'+w.type+'/'+w.id)||!store.get('/3/'+w.type+'/'+w.id+'/watch/providers')||(w.type==='tv'&&(()=>{const s=store.get('/3/tv/'+w.id)?.data.seasons?.find(s=>s.season_number>0);return s&&!store.get('/3/tv/'+w.id+'/season/'+s.season_number)})())).slice(0,limit),completed=[];
 for(const w of todo){const route='/3/'+w.type+'/'+w.id,raw=await source.load(route);await source.load(route+'/watch/providers');if(w.type==='tv'){const s=raw.seasons.find(s=>s.season_number>0);if(s)await source.load('/3/tv/'+w.id+'/season/'+s.season_number)}completed.push(w)}
 if(samplePerson&&completed.length){const id=store.get('/3/'+completed[0].type+'/'+completed[0].id).data.credits.cast.find(p=>Number.isSafeInteger(p.id)&&p.id>0)?.id;if(id){const profile=await source.load('/3/person/'+id),credits=await source.load('/3/person/'+id+'/combined_credits');require('../../api/_content-source-adapters').personSource(id,profile,credits)}}
 return {completed,stats:source.stats,totalFixed:roster.filter(w=>store.get('/3/'+w.type+'/'+w.id)).length,totalProviders:roster.filter(w=>store.get('/3/'+w.type+'/'+w.id+'/watch/providers')).length};
}
module.exports={packetStore,collector,collectBatch,importShadow,routeAllowed,validate,privateDirectory};
