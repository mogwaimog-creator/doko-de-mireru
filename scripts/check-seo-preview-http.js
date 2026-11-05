'use strict';
// Read-only HTTP smoke test for a user-approved isolated Vercel preview URL.
// Never deploys, writes Redis, or calls application APIs directly.
// Usage: node scripts/check-seo-preview-http.js https://YOUR-PREVIEW-HOST
const assert=require('node:assert/strict');
const base=process.argv[2];
if(!base||!/^https:\/\//.test(base)){console.error('Provide an explicit HTTPS preview base URL');process.exit(2);}
const origin=new URL(base);
if(origin.pathname!=='/'||origin.search||origin.hash)throw Error('Use a preview origin, not a page URL');
if(origin.hostname==='doko-de-mireru.com'||origin.hostname==='www.doko-de-mireru.com')throw Error('Refusing production hostname');
const cases=[
 {path:'/detail.html?id=50014',expected:'movie-50014',canonical:'/detail.html?id=50014'},
 {path:'/detail.html?id=50014&type=movie',expected:'movie-50014',canonical:'/detail.html?id=50014'},
 {path:'/detail.html?id=202879&type=tv',expected:'tv-202879',canonical:'/detail.html?id=202879&amp;type=tv'},
 {path:'/person.html?id=1134684',expected:'person-1134684',canonical:'/person.html?id=1134684'},
 {path:'/detail.html?id=999999999',fallback:true},
 {path:'/person.html?id=999999999',fallback:true}
];
(async()=>{
 for(const c of cases){
  const response=await fetch(new URL(c.path,origin),{redirect:'manual',headers:{'user-agent':'doko-seo-preview-readonly-check/1.0'}});
  assert.equal(response.status,200,c.path+' status '+response.status);
  const html=await response.text();
  assert.match(html,/<html\b/i,c.path+' is not HTML');
  if(c.expected){
   assert.match(html,/<title>[^<]+<\/title>/i,c.path+' missing title');
   assert.match(html,/rel=["']canonical["']/i,c.path+' missing canonical');
   assert.match(html,/<h1\b/i,c.path+' missing heading');
   assert.ok(html.includes('staticSeoId'),c.path+' missing static identity');
   assert.ok(html.includes(c.canonical),c.path+' missing expected canonical identity');
   assert.ok(!/<meta[^>]+name=[\"']robots[\"'][^>]+noindex/i.test(html),c.path+' unexpectedly noindex');
  }else{
   assert.ok(!html.includes('staticSeoId'),c.path+' fallback unexpectedly uses static record');
  }
  console.log(c.path+': '+response.status+' '+(c.fallback?'fallback':'record HTML')+' verified');
 }
 console.log('Preview HTTP smoke test passed; review page rendering, SEO canonical and function usage separately.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
