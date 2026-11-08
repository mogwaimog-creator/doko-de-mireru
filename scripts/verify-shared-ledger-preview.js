'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const catalog=require('../data/watch-order-memberships.json');
async function main(){
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const results=[],errors=[],external=[];
 try{
  const context=await browser.newContext();
  await context.route('**/*',route=>{if(new URL(route.request().url()).hostname!=='127.0.0.1'){external.push(route.request().url());return route.abort()}return route.continue()});
  const page=await context.newPage();page.on('pageerror',e=>errors.push({url:page.url(),message:e.message}));
  for(const [series,works] of Object.entries(catalog)){
   const response=await context.request.get('http://127.0.0.1:16381/api/series-watch?series='+series);assert.equal(response.status(),200);const body=await response.json();assert.equal(body.complete,true);assert.equal(Object.keys(body.providers).length,new Set(works.map(w=>w.type+':'+w.id)).size);results.push({test:'series API '+series,passed:true,works:works.length});
  }
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   for(const file of ['kimetsu.html','streaming.html']){
    const responses=[];const listener=res=>{if(res.url().includes('/api/series-watch'))responses.push(res.status())};page.on('response',listener);
    await page.goto('http://127.0.0.1:16381/'+file+(file==='streaming.html'?'?view=series':''),{waitUntil:'networkidle'});
    if(file==='streaming.html'){await page.locator('#series-table-scroll').scrollIntoViewIfNeeded();await page.waitForTimeout(600)}
    assert(responses.length>0);assert(responses.every(x=>x===200));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
    results.push({test:width+' '+file,passed:true,seriesReads:responses.length,horizontalOverflow:overflow});
    await page.screenshot({path:`/workspace/work/${width}-${file}.png`,fullPage:false});page.off('response',listener);
   }
   for(const [type,id,title] of [['movie',635302,'無限列車編'],['tv',85937,'鬼滅の刃']]){
    const url=`http://127.0.0.1:16381/detail.html?id=${id}&type=${type}&seo=1`;
    const response=await context.request.get(url),html=await response.text();assert(html.includes('data-seo-ledger="1"'));assert(html.includes(title));assert(html.includes(type==='tv'?'id=85937&amp;type=tv':'id=635302"'));
    await page.goto(url,{waitUntil:'networkidle'});assert((await page.locator('#title').innerText()).includes(title));
    results.push({test:width+' detail '+type,passed:true,initialSeo:true});
   }
  }
  // Saved content traverses real API handlers without any TMDB request, even a fixture one.
  const metricsBefore=await (await context.request.get('http://127.0.0.1:16381/__metrics')).json();
  const person=await (await context.request.get('http://127.0.0.1:16381/api/search?personId=1813')).json();assert.equal(person.id,1813);assert.equal(person.cast.length,1);
  const tv=await (await context.request.get('http://127.0.0.1:16381/api/search?id=85937&type=tv')).json();
  const season=await (await context.request.get('http://127.0.0.1:16381/api/search?id=85937&type=tv&season=1')).json();assert.equal(tv.seasons[0].season_number,season.season_number);assert.equal(tv.seasons[0].episode_count,season.episodes.length);
  await page.goto('http://127.0.0.1:16381/person.html?id=1813',{waitUntil:'networkidle'});assert((await page.locator('#personName').innerText()).includes('隔離試験用人物'));
  await page.goto('http://127.0.0.1:16381/detail.html?id=85937&type=tv',{waitUntil:'networkidle'});
  await page.locator('#seasonList button').first().click();await page.waitForSelector('#episodeList .episode-item');assert((await page.locator('#episodeList').innerText()).includes('隔離試験エピソード'));
  results.push({test:'mobile season click reads saved episode ledger through actual API',passed:true});
  const missing=await context.request.get('http://127.0.0.1:16381/api/search?id=9000001');assert.equal(missing.status(),503);results.push({test:'missing fixed work fails closed without legacy TMDB fallback',passed:true});
  results.push({test:'saved person API and mobile page',passed:true});results.push({test:'TV season list/count and lazy episodes share one saved manifest',passed:true});
  const general=await (await context.request.get('http://127.0.0.1:16381/api/search?id=862')).json();assert.equal(general.streamingMeta.status,'fresh');
  const afterFirst=await (await context.request.get('http://127.0.0.1:16381/__metrics')).json();
  await context.request.get('http://127.0.0.1:16381/api/search?id=862');
  const afterSecond=await (await context.request.get('http://127.0.0.1:16381/__metrics')).json();assert.equal(afterFirst.providerFixtureLoads,afterSecond.providerFixtureLoads);
  results.push({test:'general work API refreshes eligible saved fixture and reuses success',passed:true});
  assert.equal(afterSecond.upstreamFixtureCalls,metricsBefore.upstreamFixtureCalls);
  results.push({test:'saved work/person/season API routes issue zero TMDB calls',passed:true});
  // Validate initial HTML for every repository work with a known title.
  const known=require('./audit-shared-ledgers').inventory().seo;
  for(const record of known){const response=await context.request.get(`http://127.0.0.1:16381/detail.html?id=${record.id}&type=${record.type}`);assert.equal(response.status(),200);const html=await response.text();assert(html.includes('data-seo-ledger="1"'));assert(html.includes('<h1 id="title">'));assert(html.includes(record.canonical.replaceAll('&','&amp;')))}
  results.push({test:'all '+known.length+' known-title works return saved SEO in initial HTML',passed:true,works:known.length});
  const original=await (await context.request.get('http://127.0.0.1:16381/api/search?id=635302')).json();
  const requests=[];page.on('request',r=>{if(r.url().includes('/api/search'))requests.push(r.url())});
  let activeMeta;
  await page.route('**/api/search?*',route=>{
    if(new URL(route.request().url()).searchParams.get('id')!=='635302')return route.continue();
    const body={...original,streamingMeta:activeMeta,series:{name:'隔離関連作品',movies:[{id:1771,title:'取得済み0件のカード'},{id:1726,title:'未取得カード'}]},seriesStreamingByWork:{'movie:1771':[]},seriesStreamingManaged:true};
    if(activeMeta.status==='unknown'||activeMeta.status==='failed'||activeMeta.flatrateEmpty){body.streaming=[];body.rental=[];body.purchase=[]}
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  for(const width of [1280,390]){
    await page.setViewportSize({width,height:900});
    for(const status of ['fresh','stale','unknown','failed']){
      activeMeta={status,lastSuccessAt:['fresh','stale'].includes(status)?'2026-11-01T00:00:00Z':null,coverage:['flatrate','rent','buy'],refreshFailed:status==='stale',flatrateEmpty:status==='fresh'};
      await page.goto('http://127.0.0.1:16381/detail.html?id=635302',{waitUntil:'networkidle'});
      const notice=await page.locator('#streamingFreshness').innerText();assert(notice.includes(status==='stale'?'古い':status==='unknown'?'まだ取得':status==='failed'?'取得できて':'保存済み'));
      if(status==='fresh'||status==='stale')assert(notice.includes('日本時間'));
      const cards=await page.locator('.series-streaming-status').allTextContents();assert(cards.some(x=>x==='配信情報なし'));assert(cards.some(x=>x.includes('更新待ち')));
      assert(!requests.some(url=>/id=(1771|1726)(?:&|$)/.test(url)));
      results.push({test:width+' freshness '+status+' and managed related misses',passed:true});
    }
  }
  assert.equal(errors.length,0);
  fs.writeFileSync('/workspace/work/browser-results.json',JSON.stringify({results,errors,externalRequestsBlocked:external.length,liveExternalRequests:0},null,2));
  console.log(JSON.stringify({checks:results.length,errors:errors.length,externalRequestsBlocked:external.length,overflow:results.filter(r=>r.horizontalOverflow).map(r=>r.test)}));
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
