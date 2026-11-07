'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');
const begin=source.indexOf('if (season > 0) {');
const finish=source.indexOf('\n\n\n    const result =\n      await getTvDetail(',begin);
assert.ok(begin>=0&&finish>begin,'cannot locate actual season branch');
const block=source.slice(begin,finish);
async function run({enabled,newStatus=200,id='123',throwNew=false,throwInit=false}){
 let legacy=0,modern=0;const headers={};let returned;
 const res={setHeader(k,v){headers[k]=v;return this;},status(n){this.code=n;return this;},json(v){returned=v;return this;}};
 const context={season:1,id,apiKey:'TEST',fetchJson:async()=>{},console:{error:()=>{}},req:{method:'GET',query:{id,type:'tv',season:'1'}},res,
 process:{env:{SEASON_LEDGER_ENABLED:enabled?'1':'0'}},
 require(name){assert.equal(name,'./_season-search-branch');return {makeSeasonSearchBranch(){if(throwInit)throw Error('mock init failure');return async(req,capture)=>{modern++;if(throwNew)throw Error('mock ledger failure');capture.status(newStatus).json({source:'new'});};}};},
 async getTvSeason(){legacy++;return {source:'legacy'};}
 };
 const code='(async()=>{'+block+'})()';
 await vm.runInNewContext(code,context,{timeout:1000});
 return {legacy,modern,headers,returned};
}
(async()=>{
 let r=await run({enabled:false});
 assert.equal(r.legacy,1);assert.equal(r.modern,0);assert.equal(r.returned.source,'legacy');
 r=await run({enabled:true});
 assert.equal(r.legacy,0);assert.equal(r.modern,1);assert.equal(r.returned.source,'new');
 r=await run({enabled:true,newStatus:503});
 assert.equal(r.legacy,1);assert.equal(r.modern,1);assert.equal(r.returned.source,'legacy');
 assert.equal(r.headers['Cache-Control'],'no-store');
 assert.equal(r.headers['Vercel-CDN-Cache-Control'],'no-store');
 r=await run({enabled:true,throwNew:true});
 assert.equal(r.legacy,1);assert.equal(r.modern,1);assert.equal(r.returned.source,'legacy');
 assert.equal(r.headers['Cache-Control'],'no-store');
 r=await run({enabled:true,throwInit:true});
 assert.equal(r.legacy,1);assert.equal(r.modern,0);assert.equal(r.returned.source,'legacy');
 r=await run({enabled:true,id:'abc'});
 assert.equal(r.legacy,1);assert.equal(r.modern,0);
 console.log('season search switch behavior tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
