'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),option=k=>args[args.indexOf(k)+1],dir=args.includes('--out')?option('--out'):null,target=args.includes('--target')?option('--target'):null;
(async()=>{
 if(!dir||!['upstash','local'].includes(target)||process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production')throw Error('explicit private --out and --target required');
 require('./lib/staged-tmdb').privateDirectory(dir);
 const catalog=require(root+'/data/watch-order-memberships.json'),kit=require(root+'/scripts/lib/staged-ledger-store');
 const state=JSON.parse(fs.readFileSync(path.join(dir,'ledger-'+target+'.json'))),all=[...new Set(Object.values(catalog).flat().map(w=>w.type+':'+w.id))];
 assert(all.every(k=>state.saved.includes(k)),'all roster records must already be registered');
 kit.acquireLock(dir,target);const decode=v=>Buffer.isBuffer(v)?v.toString():Array.isArray(v)?v.map(decode):v,localCommand=async a=>decode(await require('./lib/local-binary-redis').command(a)),storage=kit.storage(dir,target,{localCommand});let sourceCalls=0,reads=0,runtimeTrackingWrites=0;const tickets=new Set(),ENTER=require(root+'/api/_cutover-runtime-dev').ENTER;
 const command=async args=>{
  if(['GET','MGET','ZRANGE','ZSCORE','ZCARD','EXISTS'].includes(args[0]))reads++;
  else if(args[0]==='EVAL'&&args[1]===ENTER&&args[2]==='2'&&args[3]==='doko:dev:content-control:v1'&&args[4]==='doko:dev:cutover:v1:active'){tickets.add(args[5]);runtimeTrackingWrites++;}
  else if(args[0]==='HDEL'&&args[1]==='doko:dev:cutover:v1:active'&&tickets.has(args[2])){tickets.delete(args[2]);runtimeTrackingWrites++;}
  else throw Error('verification attempted a data write');
  return storage.command(args);
 };
 const app=require(root+'/api/_release-application').application({command,config:{},source:async()=>{sourceCalls++;throw Error('source acquisition disabled during final verification')}});
 const capture=()=>({statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(v){this.value=v;return this},end(v){this.value=v;return this}});
 const checks=[],detailCache=new Map(),ids=rows=>rows.map(p=>p.provider_id??p.providerId??p.id).sort((a,b)=>a-b);
 for(const [series,works] of Object.entries(catalog)){
  const response=capture();await app.handle('series-watch',{method:'GET',headers:{},query:{series}},response);assert.equal(response.statusCode,200);assert.equal(response.value.complete,true);assert.deepEqual(response.value.failures,[]);
  const expected=[...new Set(works.map(w=>w.type+':'+w.id))];assert.deepEqual(Object.keys(response.value.providers).sort(),expected.sort());
  const sample=works[0],key=sample.type+':'+sample.id;
  if(!detailCache.has(key))detailCache.set(key,await app.detail(sample.type,sample.id));
  const detail=detailCache.get(key),watch=response.value.providers[key];assert.deepEqual(ids(detail.streaming),ids(watch.flatrate));assert.equal(detail.streamingMeta.lastSuccessAt,watch.checkedAt);
  checks.push({series,works:expected.length,sample:key,sameSharedProviders:true,sameSuccessTimestamp:true});
 }
 assert.equal(sourceCalls,0);assert.equal(tickets.size,0);const metrics=await storage.measure(),report={at:new Date().toISOString(),scope:'all-13-series-saved-data-read-only',target,checks,uniqueWorks:all.length,uniqueDetailSamples:detailCache.size,sourceCalls,readRequests:reads,metrics,legacyReads:0,dataWrites:0,runtimeTrackingWrites,productionChanged:false};
 fs.writeFileSync(path.join(dir,'all-series-verification-'+target+'.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
})().catch(e=>{console.error(e.message);process.exitCode=1});
