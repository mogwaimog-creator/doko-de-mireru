'use strict';
const assert=require('node:assert/strict');
const {makeSeasonSearchBranch}=require('../api/_season-search-branch');
const now=Date.parse('2026-11-07T00:00:00Z');
const saved={type:'tv',id:123,seasonNumber:1,seasonName:'old',episodes:[],
 checkedAt:'2026-10-01T00:00:00Z',status:'airing'};
const payload={season_number:1,name:'new',episodes:[{episode_number:1,name:'New episode'}]};
function response(){return {code:200,status(n){this.code=n;return this;},json(v){this.body=v;return this;}};}
(async()=>{
 let stored={...saved},fetches=0,refreshes=0;
 const storage={getRecord:async()=>stored,putRecordIfAbsent:async()=>{throw Error('unexpected create');}};
 const fetchJson=async url=>{fetches++;assert.match(url,/\/tv\/123\/season\/1/);return payload;};
 const req={method:'GET',query:{type:'tv',id:'123',season:'1'}};
 const noRefresh=makeSeasonSearchBranch({fetchJson,apiKey:'TEST',storage});
 let res=response();await noRefresh(req,res);
 assert.equal(res.code,200);assert.equal(res.body.season_name,'old');assert.equal(fetches,0);
 const refreshRecord=async (_saved,load)=>{refreshes++;stored=await load();return stored;};
 const withRefresh=makeSeasonSearchBranch({fetchJson,apiKey:'TEST',storage,refreshRecord});
 // The API uses real time. A historical checkedAt ensures a due refresh.
 res=response();await withRefresh(req,res);
 assert.equal(res.code,200);assert.equal(res.body.season_name,'new');
 assert.equal(fetches,1);assert.equal(refreshes,1);
 stored={...saved};
 const failing=makeSeasonSearchBranch({fetchJson:async()=>{throw Error('upstream down');},apiKey:'TEST',storage,refreshRecord});
 res=response();await failing(req,res);
 assert.equal(res.code,200);assert.equal(res.body.season_name,'old');
 res=response();await withRefresh({method:'POST',query:req.query},res);
 assert.equal(res.code,405);
 console.log('season API opt-in refresh integration tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
