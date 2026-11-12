'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../detail.html'),'utf8');
function extract(name,next){
 const start=html.indexOf('async function '+name+'(');
 const end=html.indexOf(next,start);
 assert.ok(start>=0&&end>start,'missing '+name);
 return html.slice(start,end);
}
const code=extract('loadSeason','/* =========================================================\n   エピソード表示');
async function scenario({ok=true,body='{}',reject=false}){
 const nodes=new Map();
 for(const id of ['episodeSection','episodeHeading','episodeList'])nodes.set(id,{style:{display:'none'},innerHTML:'',textContent:''});
 let url,options,rendered=null,errors=[];
 const context={API_URL:'/api/search',encodeURIComponent,document:{getElementById:id=>nodes.get(id)},
 fetch:async(u,o)=>{url=u;options=o;if(reject)throw Error('network');return {ok,status:ok?200:503,text:async()=>body};},
 renderEpisodes:data=>{rendered=data;},console:{error:(...a)=>errors.push(a)}};
 vm.runInNewContext(code,context);
 await context.loadSeason(123,2,'tv');
 return {nodes,url,options,rendered,errors};
}
(async()=>{
 let r=await scenario({ok:true,body:'{"season_name":"第2期","episodes":[]}'});
 assert.equal(r.url,'/api/search?id=123&type=tv&season=2');
 assert.equal(r.options.method,'GET');assert.equal(r.options.cache,'no-store');
 assert.equal(r.rendered.season_name,'第2期');
 r=await scenario({ok:false,body:'{"error":"unavailable"}'});
 assert.match(r.nodes.get('episodeList').innerHTML,/取得できませんでした/);
 assert.equal(r.rendered,null);
 r=await scenario({ok:true,body:'not json'});
 assert.match(r.nodes.get('episodeList').innerHTML,/取得できませんでした/);
 r=await scenario({reject:true});
 assert.match(r.nodes.get('episodeList').innerHTML,/取得できませんでした/);
 console.log('season detail click fetch/error mock tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
