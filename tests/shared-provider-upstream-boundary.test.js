'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function boundary(enabled){
 const source=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');const begin=source.indexOf('async function fetchJson(url'),end=source.indexOf('\n}\n',source.indexOf('async function fetchJsonNetwork(url)',begin))+2;
 const upstream=[],reads=[],context={URL,process:{env:{}},console:{log(){},error(){}},require:name=>{if(name==='./_recovery-fetch-cache')return {enabled:()=>false};assert.equal(name,'./_shared-streaming-read');return {enabled:()=>enabled,readDetail:async(type,id)=>{reads.push({type,id});return {data:{results:{JP:{flatrate:[]}}}}}}},fetch:async url=>{upstream.push(String(url));return {ok:true,status:200,text:async()=>JSON.stringify({id:85937,'watch/providers':{results:{JP:{flatrate:[{provider_id:999}]}}}})}}};
 vm.createContext(context);vm.runInContext(source.slice(begin,end)+';this.run=fetchJson;',context);return {run:context.run,upstream,reads};
}
test('managed direct provider endpoint reads saved data and never calls TMDB',async()=>{
 const b=boundary(true),result=await b.run('https://api.themoviedb.org/3/tv/85937/watch/providers?api_key=fixture');assert.equal(b.upstream.length,0);assert.equal(b.reads.length,1);assert.equal(result.results.JP.flatrate.length,0);
});
test('managed metadata append excludes providers and substitutes saved availability',async()=>{
 const b=boundary(true),result=await b.run('https://api.themoviedb.org/3/tv/85937?api_key=fixture&append_to_response=credits,watch/providers');
 assert.equal(b.upstream.length,1);assert.equal(new URL(b.upstream[0]).searchParams.get('append_to_response'),'credits');assert.equal(result['watch/providers'].results.JP.flatrate.length,0);assert.equal(b.reads[0].id,85937);
});
test('disabled flag preserves legacy upstream URL and response',async()=>{
 const b=boundary(false),url='https://api.themoviedb.org/3/tv/85937?api_key=fixture&append_to_response=credits,watch/providers',result=await b.run(url);
 assert.equal(b.upstream[0],url);assert.equal(b.reads.length,0);assert.equal(result['watch/providers'].results.JP.flatrate[0].provider_id,999);
});
