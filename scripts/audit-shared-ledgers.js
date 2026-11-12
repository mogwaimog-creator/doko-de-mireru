'use strict';
// Offline inventory only. No credential reads, network, Redis writes or deletion.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const catalog=require('../data/watch-order-memberships.json');
const {store}=require('../prototype/work-ledger');
const {createSeoRecord}=require('../prototype/seo-ledger');
function inventory(){
 const comparisonHtml=fs.readFileSync(path.join(root,'streaming.html'),'utf8');
 const comparison=JSON.parse(comparisonHtml.match(/<script type="application\/json" id="series-comparison-data">([\s\S]*?)<\/script>/)[1]);
 const titles=new Map(comparison.rows.flatMap(r=>r.works.map(w=>[w.type+':'+w.id,w.title])));
 const explicit=require('./repository-work-evidence').evidence();
 const rows=new Map(),unresolved=[];
 const ledger=store();let appearances=0;
 for(const [scope,works] of Object.entries(catalog)){
  const html=fs.readFileSync(path.join(root,scope+'.html'),'utf8');
  for(const w of works){
   appearances++;const k=w.type+':'+w.id;
   if(!rows.has(k))rows.set(k,{...w,memberships:[],pageSources:{}});
   const row=rows.get(k);row.memberships.push({kind:'watchOrder',scope});
   // Retain page titles as editorial source, never confirm as TMDB fixed data.
   const links=[...html.matchAll(/<a\b[^>]*href=["']detail\.html\?id=(\d+)(?:&(?:amp;)?type=(tv|movie))?[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)];
   const match=links.find(m=>Number(m[1])===w.id&&(m[2]||'movie')===w.type&&m[3].replace(/<[^>]*>/g,'').trim()&&!/作品詳細を見る|詳細を見る/.test(m[3]));
   if(titles.has(k))row.pageSources['comparison']={title:titles.get(k),source:'streaming.html:series-comparison-data'};
   if(explicit.has(k))row.pageSources['explicit-id-map']=explicit.get(k);
   if(match){const title=match[3].replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();if(title.length<=160)row.pageSources[scope]={title,source:scope+'.html'}}
  }
 }
 for(const [k,w] of rows){
  const source=Object.values(w.pageSources)[0];ledger.register(w.type,w.id,source?{title:source.title}:{});
  for(const m of w.memberships)ledger.member(w.type,w.id,m.kind,m.scope);
  if(!source)unresolved.push(k);
 }
 const records=JSON.parse(ledger.save()).records;
 const seo=records.filter(r=>r.fields.title).map(r=>createSeoRecord({type:r.type,id:r.id,...r.fields},{updatedAt:'2026-11-09T00:00:00Z'}));
 const old=require('../data/streaming-works.json'),oldKeys=new Set(old.map(w=>w.type+':'+w.id));
 return {seriesCounts:Object.fromEntries(Object.entries(catalog).map(([k,v])=>[k,v.length])),appearances,uniqueWorks:rows.size,duplicateAppearances:appearances-rows.size,oldUpdateWorks:oldKeys.size,missingFromOldUpdate:[...rows.keys()].filter(k=>!oldKeys.has(k)),extraInOldUpdate:[...oldKeys].filter(k=>!rows.has(k)),historicalProviderSnapshots:Object.keys(comparison.snapshot||{}).length,historicalSnapshotDate:comparison.checkedAt,titlesFound:records.length-unresolved.length,missingTitles:unresolved,metadataBytes:Buffer.byteLength(JSON.stringify(records)),seoBytes:Buffer.byteLength(JSON.stringify(seo)),records,seo,source:'repository static page text; no live TMDB metadata/provider snapshot'};
}
if(require.main===module)console.log(JSON.stringify(inventory(),null,2));
module.exports={inventory};
