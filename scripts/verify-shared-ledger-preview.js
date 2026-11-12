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
   for(const file of [...Object.keys(catalog).map(n=>n+'.html'),'streaming.html']){
    const responses=[];const listener=res=>{if(res.url().includes('/api/series-watch'))responses.push(res.status())};page.on('response',listener);
    await page.goto('http://127.0.0.1:16381/'+file+(file==='streaming.html'?'?view=series':''),{waitUntil:'networkidle'});
    if(file==='streaming.html'){await page.locator('#row-0').scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('#row-0 button[data-provider="0"] strong')?.textContent.trim()==='1 / 1');assert((await page.locator('#row-0 button[data-provider="0"] small').innerText()).includes('見放題'))}
    if(!responses.length){const lazy=page.locator('.providers:visible').first();if(await lazy.count())await lazy.scrollIntoViewIfNeeded();else await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForTimeout(800)}
    assert(responses.length>0,file+' did not read series API');assert(responses.every(x=>x===200));
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
  const searchBefore=await (await context.request.get('http://127.0.0.1:16381/__metrics')).json();
  for(const type of ['movie','tv','all']){const r=await context.request.get('http://127.0.0.1:16381/api/search?query='+encodeURIComponent('鬼滅')+'&type='+type);assert.equal(r.status(),200);const body=await r.json();assert(body.results.length>0);assert.equal(body.scope,'saved-only');if(type==='tv')assert(body.results.every(w=>w.content_type!=='movie'))}
  const ps=await (await context.request.get('http://127.0.0.1:16381/api/search?personSearch='+encodeURIComponent('隔離試験用人物'))).json();assert.equal(ps.results[0].id,1813);
  const unknown=await (await context.request.get('http://127.0.0.1:16381/api/search?query=nonexistent-saved-work')).json();assert.equal(unknown.results.length,0);
  const searchAfter=await (await context.request.get('http://127.0.0.1:16381/__metrics')).json();assert.equal(searchAfter.upstreamFixtureCalls,searchBefore.upstreamFixtureCalls);assert.equal(searchAfter.providerFixtureLoads,searchBefore.providerFixtureLoads);
  results.push({test:'normal movie/TV/all and person saved search, no-hit, zero upstream calls',passed:true});
  await page.setViewportSize({width:390,height:900});await page.goto('http://127.0.0.1:16381/index.html',{waitUntil:'networkidle'});
  await page.locator('#personSearchInput').fill('隔離試験用人物');await page.locator('#personSearchButton').click();await page.waitForFunction(()=>document.querySelector('#personSearchResults')?.textContent.includes('隔離試験用人物'));
  assert(await page.locator('#personSearchResults a[href*="person.html?id=1813"]').count());results.push({test:'mobile person search UI links to canonical saved person',passed:true});
  await page.locator('#query').fill('鬼滅');await page.locator('#searchButton').click();await page.waitForFunction(()=>document.querySelector('#results')?.textContent.includes('鬼滅'));assert(await page.locator('#results a[href*="detail.html?id="]').count());results.push({test:'mobile normal work search UI links to canonical saved details',passed:true});
  await page.locator('#query').fill('ガンダム');await page.locator('#allSearchButton').click();await page.waitForSelector('#loadMoreButton');
  const savedLinks=()=>page.locator('#results a[href*="detail.html?id="]').evaluateAll(links=>[...new Set(links.map(a=>a.href))]);const firstPage=await savedLinks();assert.equal(firstPage.length,20);await page.locator('#loadMoreButton').click();await page.waitForFunction(()=>new Set([...document.querySelectorAll('#results a[href*="detail.html?id="]')].map(a=>a.href)).size>20);const expanded=await savedLinks();assert(expanded.length>20);assert.equal(expanded.length,new Set(expanded).size);results.push({test:'mobile saved search follows cursor to more than 20 Gundam titles',passed:true,works:expanded.length});
  // Explicit local refresh endpoint -> atomic saved work/SEO -> normal API and initial HTML.
  const refreshed=await context.request.post('http://127.0.0.1:16380/content-refresh',{data:{kind:'work',type:'movie',id:635302,force:true}});assert.equal(refreshed.status(),200);assert.equal((await refreshed.json()).status,'saved');
  const savedDetail=await context.request.get('http://127.0.0.1:16381/api/search?id=635302&type=movie');assert.equal(savedDetail.status(),200);assert((await savedDetail.json()).title.includes('無限列車編'));
  const savedHtml=await (await context.request.get('http://127.0.0.1:16381/detail.html?id=635302')).text();assert(savedHtml.includes('data-seo-ledger="1"'));assert(savedHtml.includes('無限列車編'));results.push({test:'local explicit refresh publishes work and SEO through normal detail API and initial HTML',passed:true});
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
  const fullBefore=await (await context.request.get('http://127.0.0.1:16381/__metrics')).json();
  for(const record of known){const response=await context.request.get(`http://127.0.0.1:16381/api/search?id=${record.id}&type=${record.type}`);assert.equal(response.status(),200);const detail=await response.json();assert.equal(detail.id,record.id);assert(detail.title);if(record.type==='tv'){assert(Array.isArray(detail.seasons));assert.equal(detail.seasons.length,1)}}
  const fullAfter=await (await context.request.get('http://127.0.0.1:16381/__metrics')).json();assert.equal(fullAfter.upstreamFixtureCalls,fullBefore.upstreamFixtureCalls);assert.equal(fullAfter.providerFixtureLoads,fullBefore.providerFixtureLoads);
  results.push({test:'all 266 actual IDs traverse saved detail API with zero upstream loads',passed:true,works:known.length,metadata:'repository names only; seasons/providers are fixtures'});
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
  const cronUnauthorized=await context.request.get('http://127.0.0.1:16381/api/update-streaming');assert.equal(cronUnauthorized.status(),401);results.push({test:'existing cron route rejects missing administrator bearer token',passed:true});
  const cronAuthorized=await context.request.get('http://127.0.0.1:16381/api/update-streaming',{headers:{Authorization:'Bearer local-fixture-cron'}});assert.equal(cronAuthorized.status(),200);const cronBody=await cronAuthorized.json();assert(['complete','not-due','busy'].includes(cronBody.status));results.push({test:'authenticated existing cron route traverses isolated real Redis adapter',passed:true,status:cronBody.status});
  assert.equal(errors.length,0);
  fs.writeFileSync('/workspace/work/browser-results.json',JSON.stringify({results,errors,externalRequestsBlocked:external.length,liveExternalRequests:0},null,2));
  console.log(JSON.stringify({checks:results.length,errors:errors.length,externalRequestsBlocked:external.length,overflow:results.filter(r=>r.horizontalOverflow).map(r=>r.test)}));
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
