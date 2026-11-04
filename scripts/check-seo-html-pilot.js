'use strict';
// Run manually against a Vercel preview deployment after enabling SEO_HTML_PILOT_ENABLED=1.
// Example: node scripts/check-seo-html-pilot.js https://preview.example.vercel.app
// Uses only three controlled requests; no crawling or TMDB calls.
const assert=require('node:assert/strict');
const origin=process.argv[2];
if(!origin||!/^https:\/\//.test(origin)){console.error('Usage: node scripts/check-seo-html-pilot.js https://preview-host');process.exit(2);}
const base=origin.replace(/\/$/,'');
const cases=[
  {url:'/api/seo-html-pilot?kind=work&type=movie&id=50014',canonical:'detail.html?id=50014'},
  {url:'/api/seo-html-pilot?kind=work&type=tv&id=202879',canonical:'detail.html?id=202879&amp;type=tv'},
  {url:'/api/seo-html-pilot?kind=person&id=1134684',canonical:'person.html?id=1134684'}
];
(async()=>{
 for(const item of cases){
   const response=await fetch(base+item.url,{redirect:'manual'});
   console.log(response.status,item.url,'cache:',response.headers.get('x-vercel-cache')||'unknown');
   // Some IDs may not exist in a given preview's Redis ledger; that is not a render failure.
   if(response.status===404){console.log('Ledger missing or pilot disabled; check preview settings');continue;}
   assert.equal(response.status,200,'Unexpected status');
   const html=await response.text();
   assert.match(response.headers.get('content-type')||'',/text\/html/);
   assert.match(response.headers.get('x-robots-tag')||'',/noindex/);
   assert.ok(html.includes(item.canonical),'Wrong canonical URL');
   assert.match(html,/<title>[^<]+<\/title>/);
   assert.match(html,/<meta id="metaDescription" name="description" content="[^"]+">/);
   assert.equal((html.match(/rel="canonical"/g)||[]).length,1);
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
