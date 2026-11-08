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
const root=path.join(__dirname,'..'),now=new Date().toISOString();
const rows=inventory().records;
const realNames={'tv:85937':'鬼滅の刃','movie:635302':'劇場版「鬼滅の刃」無限列車編','movie:1311031':'劇場版「鬼滅の刃」無限城編 第一章 猗窩座再来'};
const saved=new Map(rows.map(r=>[r.type+':'+r.id,r.fields.title||realNames[r.type+':'+r.id]||null]));
const fixture={results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix（隔離試験用）',logo_path:'/test-fixture.png'}],rent:[],buy:[]}}};
const originalFetch=global.fetch;
let upstreamCalls=0;
global.fetch=async(url,options)=>{
 if(new URL(url).hostname==='api.themoviedb.org'){
  upstreamCalls++;const u=new URL(url),parts=u.pathname.split('/'),id=Number(parts[3]),type=parts[2];
  let data;
  if(u.pathname.endsWith('/watch/providers'))data=fixture;
  else if(parts.length>4)data={results:[],cast:[],crew:[]};
  else data={id,title:saved.get(type+':'+id)||'隔離試験用作品',name:saved.get(type+':'+id)||'隔離試験用作品',overview:'ローカル隔離検証用の説明。配信情報は試験データです。',release_date:'2020-10-16',first_air_date:'2019-04-06',genres:[],credits:{cast:[],crew:[]},seasons:[],production_countries:[],production_companies:[],spoken_languages:[],vote_average:8,vote_count:100,runtime:117,number_of_seasons:0,number_of_episodes:0,status:'Released','watch/providers':fixture};
  return {ok:true,status:200,json:async()=>data,text:async()=>JSON.stringify(data)};
 }
 return originalFetch(url,options);
};
// Existing Redis paths are represented by read-only fixtures, never real credentials.
require.cache[require.resolve('../api/_redis')]={exports:{command:async args=>{
 if(args[0]==='MGET')return args.slice(1).map(()=>JSON.stringify({flatrate:fixture.results.JP.flatrate,checkedAt:now}));
 if(args[0]==='GET')return null;throw Error('legacy fixture is read-only');
}}};
process.env.TMDB_API_KEY='local-fixture';process.env.SHARED_STREAMING_READ_ENABLED='1';process.env.SHARED_LEDGER_DEV_URL='http://127.0.0.1:16380';
const handlers={search:require('../api/search'),'series-watch':require('../api/series-watch')};
async function start(){
 const s=service(sharedStore(command),async()=>fixture);
 for(const w of Object.values(catalog).flat())await s.visit(w.type,w.id,now,[]);
 http.createServer(async(req,res)=>{
  try{let body='';for await(const chunk of req)body+=chunk;if(body.length>1000000)throw Error('large body');const args=JSON.parse(body);
   // This bridge serves reads only. Seed/update operations stay in this process.
   if(!Array.isArray(args)||!['GET','MGET'].includes(args[0])||!args.slice(1).every(k=>/^doko:dev:shared-stream:v1:record:(movie|tv):[1-9][0-9]*$/.test(k)))throw Error('read-only namespace');
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify({result:await command(args)}));
  }catch{res.statusCode=400;res.end(JSON.stringify({error:'isolated bridge rejected request'}))}
 }).listen(16380,'127.0.0.1');
 http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://127.0.0.1:16381');
  try{
   const api=u.pathname.match(/^\/api\/([^/]+)$/);
   if(api){if(!handlers[api[1]]){res.statusCode=404;return res.end('{}')};req.query=Object.fromEntries(u.searchParams);res.status=n=>(res.statusCode=n,res);res.json=body=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body))};return await handlers[api[1]](req,res)}
   if(u.pathname==='/__metrics'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({upstreamFixtureCalls:upstreamCalls}))}
   const file=path.resolve(root,'.'+(u.pathname==='/'?'/index.html':u.pathname));if(!file.startsWith(root+path.sep))throw Error('path');
   let body=fs.readFileSync(file);if(file.endsWith('.html')){res.setHeader('Content-Type','text/html; charset=utf-8');body=Buffer.from(body.toString().replaceAll("'https://doko-de-mireru.com'","''"));}
   if(file.endsWith('/detail.html')&&u.searchParams.get('seo')==='1'){
    const type=u.searchParams.get('type')==='tv'?'tv':'movie',id=Number(u.searchParams.get('id')),title=saved.get(type+':'+id);
    if(title)body=renderDetailHtml(body.toString(),createSeoRecord({type,id,title,overview:'隔離検証用'},{updatedAt:now}));
   }
   res.end(body);
  }catch(e){res.statusCode=500;res.end('Local preview error: '+e.message)}
 }).listen(16381,'127.0.0.1',()=>console.log('Isolated fixture preview http://127.0.0.1:16381; no production connections'));
}
start().catch(e=>{console.error(e);process.exitCode=1});
