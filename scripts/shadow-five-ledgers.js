'use strict';
// Private loopback installation of the release candidate. No remote Redis, deployment or Cron.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),crypto=require('node:crypto');
const packets=require('./lib/shadow-packets');
const root=path.resolve(__dirname,'..');
function privateDirectory(value){
 const dir=path.resolve(value);fs.mkdirSync(dir,{recursive:true,mode:0o700});
 const real=fs.realpathSync(dir);if(real===root||real.startsWith(root+path.sep))throw Error('shadow output must be outside repository');
 fs.chmodSync(real,0o700);return real;
}
async function serve(bundle,dir,{port=16382}={}){
 if(process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')throw Error('local shadow only');
 if(!Number.isSafeInteger(port)||port<1024||port>65535)throw Error('invalid loopback port');
 const replay=packets.replay(bundle),{command:native}=require('../tests/helpers/local-redis');
 const sha=crypto.randomBytes(32).toString('hex'),transport=require('../api/_release-transport-candidate');
 const client=transport.createTransport({endpoint:'https://shadow.invalid',token:'loopback-only-never-a-real-token',releaseSha256:sha,phase:'new',enabled:true,role:'application',scripts:transport.coreScripts(),maxRequests:10000,maxReservedCommands:100000,request:async(_url,options)=>new Response(JSON.stringify({result:await native(JSON.parse(options.body))}))});
 const command=require('../api/_release-connection').bind(client);
 await command(['SET','doko:dev:content-control:v1',JSON.stringify({status:'ready',newWorkDailyLimit:2})]);
 let sourceReads=0;
 const source=async route=>{sourceReads++;return replay(route)};
 const app=require('../api/_release-application').application({command,config:{},source});
 for(const w of packets.works)await app.fixed(w.type,w.id);
 const stream=require('../prototype/streaming-ledger-service').service(require('../api/_shared-streaming-store').sharedStore(command),(type,id)=>source('/3/'+type+'/'+id+'/watch/providers'));
 for(const w of packets.works){const result=await stream.visit(w.type,w.id,bundle.capturedAt,[]);if(!result.updated)throw Error('shadow provider save failed: '+result.reason)}
 function capture(){return {statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(value){this.value=value;return this},end(value){this.value=value;return this}}}
 for(const query of [{personId:String(bundle.personId)},{id:'85937',type:'tv',season:String(bundle.seasonNumber)}]){const res=capture();await app.handle('search',{method:'GET',headers:{},query},res);if(res.statusCode!==200)throw Error('shadow person/season save failed')}
 const publicMetrics={scope:bundle.scope,works:bundle.works,personId:bundle.personId,seasonNumber:bundle.seasonNumber,searchMode:'local canonical index only; external discovery is not tested by this server',liveTmdbRequests:bundle.scope==='selected-tmdb-shadow'?bundle.stats.requests:0,fixtureSourcePackets:bundle.scope==='synthetic-shadow-fixtures'?bundle.stats.requests:0,remoteRedisCommands:0,deployments:0,serverRequests:[],namespace:client.prefix};
 // Measure only owned local keys. This SCAN never reaches a remote Redis.
 const prefix='doko:ledger:release:'+sha.slice(0,16)+':';let cursor='0',owned=[];
 do{const next=await native(['SCAN',cursor,'MATCH',prefix+'*','COUNT','100']);cursor=String(next[0]);owned.push(...next[1])}while(cursor!=='0');
 let memoryBytes=0;for(const key of owned)memoryBytes+=Number(await native(['MEMORY','USAGE',key])||0);
 Object.assign(publicMetrics,{localKeyCount:owned.length,localMemoryUsageBytes:memoryBytes,memoryMeasurement:'sum of MEMORY USAGE for owned keys; excludes Redis process/allocator overhead; not Upstash measurement'});
 const saveMetrics=()=>fs.writeFileSync(path.join(dir,'metrics.json'),JSON.stringify({...publicMetrics,sourcePacketReads:sourceReads,transport:client.stats},null,2)+'\n',{mode:0o600});
 const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'};
 const server=http.createServer(async(req,res)=>{
  const start=performance.now(),url=new URL(req.url,'http://127.0.0.1:'+port);
  res.on('finish',()=>{publicMetrics.serverRequests.push({path:url.pathname,status:res.statusCode,ms:Math.round((performance.now()-start)*100)/100});if(publicMetrics.serverRequests.length>1000)publicMetrics.serverRequests.shift();saveMetrics()});
  res.status=n=>(res.statusCode=n,res);res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value))};
  // Site HTML uses its production origin constant; substitute only inside this local server.
  const end=res.end.bind(res);res.end=body=>end(typeof body==='string'&&String(res.getHeader('Content-Type')).includes('text/html')?body.replaceAll("'https://doko-de-mireru.com'","''"):body);
  try{
   if(!['GET','HEAD'].includes(req.method))return res.status(405).end('GET only');
   if(url.pathname==='/__metrics')return res.json({...publicMetrics,sourcePacketReads:sourceReads,transport:client.stats});
   if(url.pathname==='/__shadow')return res.json({scope:bundle.scope,works:bundle.works,personId:bundle.personId,seasonNumber:bundle.seasonNumber});
   req.query=Object.fromEntries(url.searchParams);
   if(url.pathname==='/detail.html')return await app.handle('detail-page',req,res);
   if(url.pathname==='/api/search'&&!req.query.id&&!req.query.personId){
    const q=req.query,kind=q.personSearch||q.type==='person'?'person':'work',query=String(q.personSearch||q.query||q.q||'').trim();
    if(!query||query.length>100)return res.status(400).json({error:'bounded saved search required'});
    return res.json(await require('../api/_indexed-search').indexedSearch(query,{command,kind,type:q.type||'movie',page:Number(q.page||1),cursor:q.cursor}));
   }
   if(url.pathname.startsWith('/api/'))return await app.handle(url.pathname.slice(5),req,res);
   const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
   if(!file.startsWith(root+path.sep)||path.relative(root,file).split(path.sep).some(p=>p.startsWith('.'))||!mime[path.extname(file)])return res.status(404).end('Not found');
   res.setHeader('Content-Type',mime[path.extname(file)]);const body=fs.readFileSync(file);res.end(req.method==='HEAD'?'':(['.html','.js'].includes(path.extname(file))?body.toString('utf8'):body));
  }catch{return res.status(503).json({error:'Shadow data unavailable; no live fallback'})}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});saveMetrics();
 console.log(JSON.stringify({url:'http://127.0.0.1:'+port,scope:bundle.scope,works:bundle.works,personId:bundle.personId,seasonNumber:bundle.seasonNumber,metrics:path.join(dir,'metrics.json'),productionChanged:false}));
 return server;
}
async function main(args=process.argv.slice(2)){
 if(process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')throw Error('local shadow only');
 const opt=name=>args[args.indexOf(name)+1],collect=args.includes('--collect'),fixture=args.includes('--fixtures'),input=args.includes('--packets');
 if(!collect&&!fixture&&!input){console.log(JSON.stringify({mode:'plan',works:packets.works,people:1,seasons:1,maxTmdbRequests:packets.MAX_REQUESTS,maxResponseBytes:packets.MAX_RESPONSE_BYTES,maxTotalBytes:packets.MAX_TOTAL_BYTES,remoteRedisCommands:0,productionChanged:false,usage:'--fixtures --serve --out <private-dir> OR --collect --out <private-dir> [--serve] OR --packets <private-json> --serve --out <private-dir>'}));return}
 if([collect,fixture,input].filter(Boolean).length!==1||!args.includes('--out'))throw Error('select exactly one source and private --out');
 if(collect&&!process.env.TMDB_API_KEY)throw Error('TMDB_API_KEY missing; live collection deferred');
 const dir=privateDirectory(opt('--out'));let bundle;
 if(input){const file=opt('--packets');if(fs.statSync(file).size>packets.MAX_TOTAL_BYTES+65536)throw Error('oversized shadow bundle');bundle=JSON.parse(fs.readFileSync(file,'utf8'));packets.replay(bundle)}
 else{
  const dest=path.join(dir,'source-packets.json');if(fs.existsSync(dest))throw Error('source packets exist; replay them instead of recollecting');
  bundle=await packets.collect(fixture?{fixture:true,request:packets.fixtureRequest}:{apiKey:process.env.TMDB_API_KEY});
  fs.writeFileSync(dest,JSON.stringify(bundle)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({sourcePackets:dest,scope:bundle.scope,requests:bundle.stats.requests,bytes:bundle.stats.responseBytes}));
 }
 if(args.includes('--serve'))return serve(bundle,dir,{port:args.includes('--port')?Number(opt('--port')):16382});
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1});
module.exports={main,serve};
