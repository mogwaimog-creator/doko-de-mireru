'use strict';
// Offline execution test: evaluate the real search handler with a controlled
// in-memory module sandbox. No Redis, TMDB, or Vercel calls.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');
const start=source.indexOf('module.exports = async function handler(req, res)');
const movieDetail=source.indexOf('await getMovieDetail(',start);
assert.ok(movieDetail>start,'movie detail branch not found');
const end=source.indexOf('// =====================================================\n// こだわり検索',movieDetail);
assert.ok(start>=0&&end>start);
const header=source.slice(start,end);
const moduleObj={exports:{}};
const context={
 module:moduleObj,process:{env:{TMDB_API_KEY:'TEST'}},
 console:{error:()=>{}},
 require:(name)=>{
  if(name==='./_season-search-branch')return {makeSeasonSearchBranch:()=>async(req,res)=>res.status(503).json({error:'mock unavailable'})};
  return {};
 },
 getDetailProviders:()=>{},metadataWithLedger:()=>{},
 withPersonLedger:async(_id,load)=>load(),
 searchPeople:async()=>[{id:1,name:'person'}],
 getPersonDetail:async()=>({id:1,name:'person detail'}),
 getTvSeason:async()=>({season_name:'legacy season',episodes:[]}),
 getTvDetail:async()=>({title:'TV detail'}),
 getMovieDetail:async()=>({title:'Movie detail'}),
 fetchJson:async()=>{},
};
vm.createContext(context);
vm.runInContext(header+'\n}catch(error){throw error;} };',context,{filename:'search-handler-excerpt.js'});
const handler=moduleObj.exports;
function res(){return {headers:{},code:200,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.body=v;return this;},end(){this.ended=true;return this;}};}
(async()=>{
 let response=res();await handler({method:'GET',query:{personSearch:'A'}},response);
 assert.equal(response.code,200);assert.equal(response.body.results[0].name,'person');
 response=res();await handler({method:'GET',query:{personId:'1'}},response);
 assert.equal(response.body.name,'person detail');
 response=res();await handler({method:'GET',query:{id:'1',type:'movie'}},response);
 assert.equal(response.body.title,'Movie detail');
 response=res();await handler({method:'GET',query:{id:'1',type:'tv'}},response);
 assert.equal(response.body.title,'TV detail');
 response=res();await handler({method:'GET',query:{id:'1',type:'tv',season:'1'}},response);
 assert.equal(response.body.season_name,'legacy season');
 context.process.env.SEASON_LEDGER_ENABLED='1';
 response=res();await handler({method:'GET',query:{id:'1',type:'tv',season:'1'}},response);
 assert.equal(response.body.season_name,'legacy season');
 assert.equal(response.headers['Vercel-CDN-Cache-Control'],'no-store');
 response=res();await handler({method:'POST',query:{}},response);
 assert.equal(response.code,405);
 console.log('search/person/detail/season handler offline behavior tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
