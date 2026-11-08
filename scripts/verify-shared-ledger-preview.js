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
  assert.equal(errors.length,0);
  fs.writeFileSync('/workspace/work/browser-results.json',JSON.stringify({results,errors,externalRequestsBlocked:external.length,liveExternalRequests:0},null,2));
  console.log(JSON.stringify({checks:results.length,errors:errors.length,externalRequestsBlocked:external.length,overflow:results.filter(r=>r.horizontalOverflow).map(r=>r.test)}));
 }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
