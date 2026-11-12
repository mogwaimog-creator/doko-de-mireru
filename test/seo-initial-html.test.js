'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createSeoRecord}=require('../prototype/seo-ledger');
const {renderDetailHtml}=require('../prototype/seo-detail-renderer');
const fs=require('node:fs'),path=require('node:path');
const template=fs.readFileSync(path.join(__dirname,'../detail.html'),'utf8');
for(const [type,id,title] of [['movie',1726,'アイアンマン'],['tv',1399,'ゲーム・オブ・スローンズ']]){
 test('saved initial SEO HTML: '+type,()=>{
  const record=createSeoRecord({type,id,title,releaseDate:type==='movie'?'2008-04-30':'2011-04-17',overview:'作品固有のあらすじです。',posterPath:'/poster.jpg'});
  const html=renderDetailHtml(template,record,{overview:'作品固有のあらすじです。',releaseDate:type==='movie'?'2008-04-30':'2011-04-17',genres:['ドラマ']});
  assert.match(html,/data-seo-ledger="1"/);
  assert.match(html,new RegExp('<h1 id="title">'+title+'</h1>'));
  assert.match(html,/id="overview"[\s\S]*?作品固有のあらすじです。<\/div>/);
  assert.match(html,/id="releaseDate"[\s\S]*?公開年：(2008|2011)年<\/div>/);
  assert.match(html,/<script type="application\/ld\+json" id="serverWorkStructuredData">/);
  assert.match(html,new RegExp('"@type":"'+(type==='movie'?'Movie':'TVSeries')+'"'));
  assert.match(html,new RegExp('detail.html\\?id='+id+(type==='tv'?'&amp;type=tv':'')));
  assert.match(html,/id="content"[\s\S]*?display:block/);
 });
}
test('overview is escaped',()=>{
 const record=createSeoRecord({type:'movie',id:1,title:'Test'});
 const html=renderDetailHtml(template,record,{overview:'<script>alert(1)</script>safe'});
 assert.doesNotMatch(html,/id="overview"[\s\S]*?<script>alert/);
});

test('saved Japanese streaming names are in initial HTML without a fetch',()=>{
 const record=createSeoRecord({type:'tv',id:1399,title:'ゲーム・オブ・スローンズ'});
 const html=renderDetailHtml(template,record,{streaming:{flatrate:[{provider_name:'U-NEXT'}],rent:[],buy:[],lastSuccessAt:'2026-11-11T00:00:00.000Z'}});
 assert.match(html,/id="serverProviders"/);
 assert.match(html,/見放題：<\/strong>U-NEXT/);
 assert.match(html,/2026-11-11T00:00:00.000Z/);
});
