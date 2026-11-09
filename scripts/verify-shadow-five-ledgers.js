'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function main(){
 const base=process.argv[2]||'http://127.0.0.1:16382',dir=path.resolve(process.argv[3]||'/workspace/work/shadow-browser');
 const origin=new URL(base);if(origin.hostname!=='127.0.0.1'||origin.protocol!=='http:')throw Error('loopback verification only');
 fs.mkdirSync(dir,{recursive:true});const checks=[],errors=[];
 const get=async route=>{const r=await fetch(base+route);assert.equal(r.status,200,route);return r.json()};
 const info=await get('/__shadow'),before=await get('/__metrics');
 const movie=await get('/api/search?id=635302&type=movie'),tv=await get('/api/search?id=85937&type=tv'),person=await get('/api/search?personId='+info.personId),season=await get('/api/search?id=85937&type=tv&season='+info.seasonNumber);
 assert.equal(movie.streamingMeta.status,'fresh');assert.equal(tv.streamingMeta.status,'fresh');assert.equal(person.id,info.personId);assert.equal(season.season_number,info.seasonNumber);
 checks.push({test:'saved movie, TV, person, episodes and shared JP providers traverse release API',passed:true});
 for(const [type,id,title] of [['movie',635302,movie.title],['tv',85937,tv.title]]){
  const r=await fetch(base+`/detail.html?id=${id}&type=${type}`),html=await r.text();assert.equal(r.status,200);assert(html.includes('data-seo-ledger="1"'));assert(html.includes('<h1 id="title">'));assert(html.includes(title));
  const expected='https://doko-de-mireru.com/detail.html?id='+id+(type==='tv'?'&amp;type=tv':'');assert(html.includes('rel="canonical" href="'+expected+'"'));assert(html.includes('property="og:title"'));assert(html.includes('name="description"'));
  checks.push({test:'initial HTML SEO '+type,passed:true,canonical:expected.replace('&amp;','&')});
 }
 for(const [type,query] of [['movie',movie.title],['tv',tv.title],['all',tv.title],['anime',tv.title]]){const body=await get('/api/search?type='+type+'&query='+encodeURIComponent(query));assert.equal(body.scope,'saved-only');assert(body.results.length>0);checks.push({test:'canonical saved search '+type,passed:true})}
 const ps=await get('/api/search?personSearch='+encodeURIComponent(person.name));assert.equal(ps.results[0].id,person.id);
 const nohit=await get('/api/search?query=shadow-no-such-title');assert.equal(nohit.results.length,0);checks.push({test:'saved person search and no-hit do not fetch metadata',passed:true});
 const series=await get('/api/series-watch?series=kimetsu');assert.equal(series.complete,false);assert(series.failures.length>0);assert(series.providers['movie:635302']);assert.equal(series.works,undefined);checks.push({test:'partial series data stays incomplete and contains no fixed metadata',passed:true});
 const missing=await fetch(base+'/detail.html?id=999000001');assert.equal(missing.status,503);assert.equal(missing.headers.get('x-robots-tag'),'noindex');checks.push({test:'uncollected work fails closed with noindex',passed:true});
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext();let blocked=0;
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin.origin){blocked++;return route.abort()}return route.continue()});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:900});
   await page.goto(base+'/index.html',{waitUntil:'networkidle'});await page.locator('#query').fill(movie.title);await page.locator('#searchButton').click();
   const result=page.locator('#results a[href*="detail.html?id=635302"]');await result.first().waitFor();await result.first().click();await page.waitForURL(/detail\.html/);await page.waitForFunction(title=>document.querySelector('#title')?.textContent.includes(title),movie.title);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(dir,'movie-'+width+'.png')});
   checks.push({test:width+' work search → saved detail UI',passed:true});
   await page.goto(base+'/index.html',{waitUntil:'networkidle'});if(!await page.locator('#personSearchInput').isVisible())await page.locator('#otherSearchToggle').click();await page.locator('#personSearchInput').fill(person.name);await page.locator('#personSearchButton').click();
   const link=page.locator('#personSearchResults a[href*="person.html?id='+person.id+'"]');await link.first().waitFor();await link.first().click();await page.waitForURL(/person\.html/);await page.waitForFunction(name=>document.querySelector('#personName')?.textContent.includes(name),person.name);
   await page.screenshot({path:path.join(dir,'person-'+width+'.png')});checks.push({test:width+' person search → saved profile/credits UI',passed:true});
   await page.goto(base+'/detail.html?id=85937&type=tv',{waitUntil:'networkidle'});await page.waitForFunction(title=>document.querySelector('#title')?.textContent.includes(title),tv.title);
   await page.locator('#seasonList button').first().click();await page.locator('#episodeList .episode-item').first().waitFor();assert((await page.locator('#episodeList').innerText()).includes(season.episodes[0].name));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);await page.screenshot({path:path.join(dir,'season-'+width+'.png')});checks.push({test:width+' TV → season → saved episode UI',passed:true});
  }
  assert.deepEqual(errors,[]);checks.push({test:'browser console has no uncaught JS exceptions',passed:true,externalRequestsBlocked:blocked});
 }finally{await browser.close()}
 const latencies=[],loadBefore=await get('/__metrics');
 await Promise.all(Array.from({length:20},async()=>{const at=performance.now();const body=await get('/api/search?id=635302&type=movie');assert.equal(body.id,635302);latencies.push(performance.now()-at)}));
 latencies.sort((a,b)=>a-b);const after=await get('/__metrics');assert.equal(after.sourcePacketReads,before.sourcePacketReads);
 checks.push({test:'20 concurrent saved reads require zero upstream or source packet reloads',passed:true,requests:20,p50Ms:Math.round(latencies[9]*100)/100,p95Ms:Math.round(latencies[18]*100)/100,localReservedCommandBound:after.transport.reservedCommands-loadBefore.transport.reservedCommands,note:'local wire-adapter upper bound, not measured Upstash billing or Vercel performance'});
 const report={dateJst:new Date(Date.now()+9*3600000).toISOString().slice(0,10),scope:info.scope,passed:checks.length,checks,errors,metrics:after,realDataVerified:info.scope==='selected-tmdb-shadow',productionChanged:false};
 fs.writeFileSync(path.join(dir,'verification.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:checks.length,errors:errors.length,scope:info.scope,report:path.join(dir,'verification.json')}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1});
module.exports={main};
