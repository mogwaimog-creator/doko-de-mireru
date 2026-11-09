'use strict';
// Loopback-only preview. All upstream metadata/providers are explicit fixtures.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {command}=require('../tests/helpers/local-redis');
const {sharedStore}=require('../api/_shared-streaming-store');
const {service}=require('../prototype/streaming-ledger-service');
const {inventory}=require('./audit-shared-ledgers');
const catalog=require('../data/watch-order-memberships.json');
const {renderDetailHtml}=require('../prototype/seo-detail-renderer');
const {createSeoRecord}=require('../prototype/seo-ledger');
if(process.env.VERCEL_ENV==='production'||process.env.NODE_ENV==='production')throw Error('local preview only');
const root=path.join(__dirname,'..'),now=new Date().toISOString();
const rows=inventory().records;
const realNames={'tv:85937':'鬼滅の刃','movie:635302':'劇場版「鬼滅の刃」無限列車編','movie:1311031':'劇場版「鬼滅の刃」無限城編 第一章 猗窩座再来'};
const saved=new Map(rows.map(r=>[r.type+':'+r.id,r.fields.title||realNames[r.type+':'+r.id]||null]));
const fixture={results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix（隔離試験用）',logo_path:'/test-fixture.png'}],rent:[],buy:[]}}};
const originalFetch=global.fetch;
let upstreamCalls=0,providerFixtureLoads=0;
const upstreamUrls=[];
global.fetch=async(url,options)=>{
 if(new URL(url).hostname==='api.themoviedb.org'){
  upstreamCalls++;upstreamUrls.push(String(url).replace(/api_key=[^&]*/g,'api_key=fixture'));const u=new URL(url),parts=u.pathname.split('/'),id=Number(parts[3]),type=parts[2];
  let data;
  if(u.pathname.startsWith('/3/search/'))data={page:1,total_pages:1,total_results:1,results:[{id:12345678,title:'Issue19Fixture',name:'Issue19Fixture',media_type:parts[3]==='person'?'person':parts[3]==='tv'?'tv':'movie',release_date:'2020-01-01',first_air_date:'2020-01-01',genre_ids:[],popularity:100,vote_count:100,vote_average:8,poster_path:'/fixture.jpg'}]};
  else if(u.pathname.endsWith('/watch/providers'))data=fixture;
  else if(/\/season\/[0-9]+$/.test(u.pathname))data={id:12345,season_number:Number(parts.at(-1)),name:'隔離試験シーズン',episodes:[{episode_number:1,name:'隔離試験エピソード',runtime:24}]};
  else if(parts.length>4)data={results:[],cast:[],crew:[]};
  else data={id,title:saved.get(type+':'+id)||'隔離試験用作品',name:saved.get(type+':'+id)||'隔離試験用作品',overview:'ローカル隔離検証用の説明。配信情報は試験データです。',release_date:'2020-10-16',first_air_date:'2019-04-06',genres:[],credits:{cast:[],crew:[]},seasons:[],production_countries:[],production_companies:[],spoken_languages:[],vote_average:8,vote_count:100,runtime:117,number_of_seasons:0,number_of_episodes:0,status:'Released','watch/providers':fixture};
  return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
 }
 return originalFetch(url,options);
};
// Existing Redis paths are represented by read-only fixtures, never real credentials.
require.cache[require.resolve('../api/_redis')]={exports:{command:async args=>{
 if(args[0]==='MGET')return command(['MGET',...args.slice(1).map(k=>k.replace('doko:watch:v3:','doko:dev:legacy-watch:v3:'))]);
 if(args[0]==='GET')return null;throw Error('legacy fixture is read-only');
}}};
process.env.DEV_CONTENT_LEDGER_ENABLED='1';process.env.TMDB_API_KEY='local-fixture';process.env.SHARED_STREAMING_READ_ENABLED='1';process.env.SHARED_LEDGER_DEV_URL='http://127.0.0.1:16380';
process.env.DEV_SHARED_CRON_ENABLED='1';process.env.CRON_SECRET='local-fixture-cron';
const handlers={'update-streaming':require('../api/update-streaming'),search:require('../api/search'),'series-watch':require('../api/series-watch')};
async function start(){
 const works=rows.map(r=>({type:r.type,id:r.id,memberships:r.memberships}));
 const native=sharedStore(command);
 const s=service(native,async()=>{providerFixtureLoads++;return fixture});
 for(const w of Object.values(catalog).flat()){await s.visit(w.type,w.id,now,[]);await command(['SET','doko:dev:legacy-watch:v3:'+w.type+':'+w.id,JSON.stringify({flatrate:fixture.results.JP.flatrate,checkedAt:now}),'NX']);}
 const content=require('../api/_dev-content-ledgers');
 const daily=process.env.DEV_LEAN_SERIES_ENABLED==='1'?require('../api/_lean-series-refresh').leanSeriesRefresh(command,async()=>{providerFixtureLoads++;return fixture}):require('../api/_streaming-daily-job').dailyJob(native,require('../api/_compact-daily-job-store').compactDailyJobStore(command),async()=>{providerFixtureLoads++;return fixture});
 const contentUpdates=require('../api/_content-ledger-coordinator').coordinator(require('../api/_dev-content-store').contentStore(command));
 const {normalizeWorkV2}=require('../api/_work-ledger-v2-schema');
 for(const row of rows){
  const title=saved.get(row.type+':'+row.id);if(!title)continue;
  const work=normalizeWorkV2(row.type,row.id,{...row.fields,title,pageExtras:row.pageExtras});
  if(row.type==='tv'){
    // Explicit fixture manifest; actual season data is not available in the repository.
    const manifest=require('../prototype/season-ledger').makeRecord(row.id,[{seasonNumber:1,name:'隔離試験シーズン',episodeCount:1,episodes:[{episodeNumber:1,name:'隔離試験エピソード',runtime:24}],episodesCheckedAt:now}],now);
    await command(['SET',content.keys.season(row.id),JSON.stringify(manifest),'NX']);
    delete work.seasons;delete work.seasonCount;delete work.episodeCount;
  }
  await command(['SET',content.keys.work(row.type,row.id),JSON.stringify(work),'NX']);
  await command(['SET',content.keys.seo(row.type,row.id),JSON.stringify(createSeoRecord(work,{updatedAt:now})),'NX']);
 }
 const general=normalizeWorkV2('movie',862,{title:'トイ・ストーリー（隔離検証）'});
 await command(['SET',content.keys.work('movie',862),JSON.stringify(general),'NX']);
 await s.visit('movie',862,new Date(Date.parse(now)-25*3600000).toISOString(),[]);
 const personStore=require('../prototype/person-ledger').store();
 const person=personStore.success({id:1813,name:'隔離試験用人物',cast:[{id:635302,media_type:'movie',title:saved.get('movie:635302')}],voice:[],directed:[],documentary_talk:[],other:[]},now);
 await command(['SET',content.keys.person(1813),JSON.stringify(person),'NX']);

 await command(['SET',require('../api/_dev-ledger-search').CATALOG,JSON.stringify({schemaVersion:1,works:rows.map(w=>({type:w.type,id:w.id})),people:[1813]}),'NX']);

 const searchIndex=require('../api/_search-index-v2');
 if(process.env.DEV_LEAN_SERIES_ENABLED!=='1')for(const key of [...rows.map(w=>content.keys.work(w.type,w.id)),content.keys.person(1813)]){const raw=await command(['GET',key]);if(raw)await searchIndex.seed(command,key,raw)}
 if(process.env.DEV_LEAN_SERIES_ENABLED!=='1')await command(['SET',searchIndex.READY,'1']);
 http.createServer(async(req,res)=>{
  try{let body='';for await(const chunk of req)body+=chunk;if(body.length>1000000)throw Error('large body');const args=JSON.parse(body);
   if(req.url==='/recovery-cache'){if(process.env.DEV_LEAN_SERIES_ENABLED!=='1')throw Error('recovery disabled');const cache=require('../api/_recovery-fetch-cache');if(!Array.isArray(args)||args[0]!=='EVAL'||![cache.CLAIM,cache.SAVE,cache.RELEASE].includes(args[1]))throw Error('recovery operation not allowed');const n=Number(args[2]);if(!Number.isInteger(n)||n<1||n>4||!args.slice(3,3+n).every(k=>k==='doko:dev:content-control:v1'||/^doko:dev:recovery:v1:(?:query:[0-9]+|content:[a-f0-9]{64})(?::lock)?$/.test(k)||k==='doko:dev:recovery:v1:content-bytes'))throw Error('recovery namespace');res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({result:await command(args)}))}
   if(req.url==='/refresh'){
    if(process.env.DEV_STREAMING_REFRESH_ENABLED!=='1')throw Error('development refresh disabled');
    const control=await require('../api/_dev-content-store').contentStore(command).readControl();if(control&&control.status!=='ready'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({status:'paused',reason:'shared-pause'}))}
    let result;if(args.trigger==='cron')result=await daily.run(args.at,works,{maxItems:args.maxItems??1000});else if(args.trigger==='auto')result=await require('../api/_daily-job-supervisor').supervisor(daily).run(args.at,works,{maxItems:args.maxItems??24});else if(args.trigger==='visit')result=await s.visit(args.type,args.id,args.at,works);else throw Error('invalid trigger');
    res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(result));
   }
   if(req.url==='/content-refresh'){
    if(process.env.DEV_CONTENT_REFRESH_ENABLED!=='1')throw Error('development content refresh disabled');
    const at=new Date().toISOString();let result;
    if(args.kind==='work'){
      const title=saved.get(args.type+':'+Number(args.id));if(!title)throw Error('unavailable offline work');
      result=await contentUpdates.work(args.type,args.id,async()=>({id:Number(args.id),title}),at,{force:args.force===true});
    }else if(args.kind==='person'&&Number(args.id)===1813)result=await contentUpdates.person(1813,async()=>person.person,at);
    else if(args.kind==='season')result=await contentUpdates.seasons(args.id,async()=>require('../api/_content-source-adapters').seasonSource(Number(args.id),{id:Number(args.id),seasons:[{season_number:1,name:'隔離試験シーズン',episode_count:1}]}),at);
    else if(args.kind==='episode')result=await contentUpdates.episode(args.id,Number(args.number),async()=>require('../api/_content-source-adapters').episodeSource(Number(args.id),Number(args.number),{tvId:Number(args.id),seasonNumber:Number(args.number),data:{season_number:Number(args.number),episodes:[{episode_number:1,name:'隔離試験エピソード',runtime:24}]}}),at);
    else throw Error('unsupported offline fixture');
    res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(result));
   }
   if(Array.isArray(args)&&args[0]==='EVAL'&&args[1]===searchIndex.SELECT&&args[2]==='1'&&/^doko:dev:search:v2:grams:(work|person)$/.test(args[3])&&args.length>=5&&args.length<=20&&args.slice(4).every(x=>/^[a-f0-9]{2,16}$/.test(x))){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({result:await command(args)}))}
   if(Array.isArray(args)&&args[0]==='EVAL'&&args[1]===require('../api/_indexed-search').READ&&Number(args[2])>=1&&Number(args[2])<=32&&args.length===Number(args[2])+3&&args.slice(3).every(k=>/^doko:dev:(?:work:v2:(movie|tv):[1-9][0-9]*|person:v2:[1-9][0-9]*)$/.test(k))){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({result:await command(args)}))}
   // This bridge serves reads only. Seed/update operations stay in this process.
   if(!Array.isArray(args)||!['GET','MGET','ZRANGEBYLEX'].includes(args[0])||!(args[0]==='ZRANGEBYLEX'?(/^doko:dev:search:v2:grams:(work|person)$/.test(args[1])&&args.length===7&&args[4]==='LIMIT'&&args[5]==='0'&&Number(args[6])<=32):args.slice(1).every(k=>/^doko:dev:(?:search:v1:catalog|search:v2:ready|shared-stream:v1:record:(?:movie|tv):[1-9][0-9]*|legacy-watch:v3:(?:movie|tv):[1-9][0-9]*|legacy-detail:v1:(?:movie|tv):[1-9][0-9]*|work:v2:(?:movie|tv):[1-9][0-9]*|legacy-work:v1:(?:movie|tv):[1-9][0-9]*|season:v1:tv:[1-9][0-9]*|person:v2:[1-9][0-9]*|seo:v1:(?:movie|tv):[1-9][0-9]*)(?::meta)?$/.test(k))))throw Error('read-only namespace');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result:await command(args)}));
  }catch{res.statusCode=400;res.end(JSON.stringify({error:'isolated bridge rejected request'}))}
 }).listen(16380,'127.0.0.1');
 http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1:16381');
  try{
   const api=u.pathname.match(/^\/api\/([^/]+)$/);
   if(api){if(!handlers[api[1]]){res.statusCode=404;return res.end('{}')};req.query=Object.fromEntries(u.searchParams);res.status=n=>(res.statusCode=n,res);res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))};return await handlers[api[1]](req,res)}
   if(u.pathname==='/__metrics'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({upstreamFixtureCalls:upstreamCalls,providerFixtureLoads,upstreamUrls}))}
   const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))throw Error('path');
   let body=fs.readFileSync(file);if(file.endsWith('.html')){res.setHeader('Content-Type','text/html; charset=utf-8');body=Buffer.from(body.toString().replaceAll("'https://doko-de-mireru.com'","''"));}
   if(file.endsWith('/detail.html')&&u.searchParams.has('id')){
    const type=u.searchParams.get('type')==='tv'?'tv':'movie',id=Number(u.searchParams.get('id')),title=saved.get(type+':'+id);
    if(title)body=renderDetailHtml(body.toString(),await content.readSeo(type,id));
   }
   res.end(body);
  }catch(e){res.statusCode=500;res.end('Local preview error: '+e.message)}
 }).listen(16381,'127.0.0.1',()=>console.log('Isolated fixture preview http://127.0.0.1:16381; no production connections'));
}
start().catch(e=>{console.error(e);process.exitCode=1});
