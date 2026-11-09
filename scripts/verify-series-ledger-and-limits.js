'use strict';
// Compare all existing pages with their protected fixed-HTML baseline in loopback only.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
const catalog=require('../data/watch-order-memberships.json'),base='http://127.0.0.1:16381';
function baseline(series){return fs.readFileSync(series+'.html','utf8').replace('<script src="series-ledger-view.js" data-series="'+series+'"></script>\n','').replace(/dokoSeriesFetch(?=\([^\n;]{0,240}\/api\/series-watch\?series=)/,'fetch').replaceAll("'https://doko-de-mireru.com'","''")}
async function dom(page){return page.evaluate(()=>{const root=document.documentElement.cloneNode(true);root.querySelectorAll('script').forEach(n=>n.remove());return root.outerHTML.replace(/>\s+</g,'><')})}
async function main(){const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']}),checks=[];try{
 for(const series of Object.keys(catalog)){
  const response=await fetch(base+'/api/series-watch?series='+series),data=await response.json();assert.equal(response.status,200);assert.equal(data.complete,true);assert.equal(data.works,undefined);assert.equal(data.workFailures,undefined);
  const contexts=[],pages=[],counts=[0,0];
  for(let variant=0;variant<2;variant++){
   const context=await browser.newContext();contexts.push(context);await context.addInitScript(()=>{window.IntersectionObserver=class{constructor(callback){this.callback=callback}observe(target){const run=()=>setTimeout(()=>this.callback([{target,isIntersecting:true,intersectionRatio:1}],this),0);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run()}unobserve(){}disconnect(){}}});
   await context.route('**/*',route=>{const u=new URL(route.request().url());if(route.request().resourceType()==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="20" height="30"></svg>'});if(u.hostname!=='127.0.0.1')return route.abort();if(variant===0&&u.pathname==='/'+series+'.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:baseline(series)});if(u.pathname==='/api/series-watch'){counts[variant]++;return route.fulfill({json:{...data,works:Object.fromEntries(catalog[series].map(w=>[w.type+':'+w.id,{...w,title:'SHOULD_NEVER_OVERWRITE_FIXED_CONTENT',releaseDate:'2999-01-01',posterPath:'/SHOULD_NEVER_REPLACE_POSTER.jpg'}]))}})}return route.continue()});
   const page=await context.newPage();pages.push(page);await page.goto(base+'/'+series+'.html',{waitUntil:'networkidle'});
  }
  const current=await dom(pages[1]),prior=await dom(pages[0]);assert.equal(current,prior,series+' changed fixed content, layout, links or streaming rendering');
  const selector='button[data-tab],button[data-category],button[data-filter],button[data-mode],[role=tab],a[data-tab][href^="#"]',tabs=await pages[1].locator(selector).count();assert.equal(tabs,await pages[0].locator(selector).count());
  for(let i=0;i<Math.min(tabs,100);i++){for(const page of pages){await page.locator(selector).nth(i).evaluate(n=>n.click());await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))}assert.equal(await dom(pages[1]),await dom(pages[0]),series+' changed tab '+i)}
  assert.equal(await pages[1].locator('.doko-ledger-fixed,[data-ledger-source="work"],[data-ledger-work="shared"]').count(),0);assert.equal(counts[1],1,series+' duplicated shared streaming request');assert(!(await pages[1].content()).includes('SHOULD_NEVER_OVERWRITE_FIXED_CONTENT'));
  checks.push({series,exactDomMatchesBaseline:true,tabsChecked:tabs,sharedStreamingRequests:counts[1],fixedMetadataFromLedger:false,providers:Object.keys(data.providers).length});for(const c of contexts)await c.close();
 }
 const context=await browser.newContext();await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());const page=await context.newPage();await page.route('**/api/series-watch?*',r=>r.fulfill({status:503,json:{error:'isolated outage'}}));await page.goto(base+'/kimetsu.html',{waitUntil:'networkidle'});assert.equal(await page.locator('.doko-ledger-fixed').count(),0);assert((await page.locator('body').innerText()).includes('鬼滅'));checks.push({streamingOutageKeepsAuthoredContent:true});await context.close();
 const evidence={dateJst:'2026-11-10',scope:'loopback Redis and provider fixtures only; no real services',passed:checks.length,checks};fs.writeFileSync('docs/ISSUE_19_STATIC13_BROWSER_20261110.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
 }finally{await browser.close()}}
main().catch(e=>{console.error(e);process.exitCode=1});
