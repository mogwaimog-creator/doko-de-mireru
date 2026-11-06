'use strict';
// Read-only preview smoke test. Usage:
// node scripts/check-seo-preview.js https://preview-host.vercel.app
// No Redis/TMDB access, no writes. Reject production domain.
const assert=require('node:assert/strict');
async function main(){
 const origin=process.argv[2];
 if(!origin)throw Error('Preview URL required');
 const base=new URL(origin);
 if(base.protocol!=='https:'||base.hostname==='doko-de-mireru.com'||base.hostname==='www.doko-de-mireru.com')throw Error('Production URLs prohibited');
 const cases=[
  {path:'/detail.html?id=157336',expected:'インターステラー'},
  {path:'/detail.html?id=202879&type=tv',expected:null},
  {path:'/person.html?id=1813',expected:null}
 ];
 for(const item of cases){
  const res=await fetch(new URL(item.path,base),{redirect:'manual'});
  assert.equal(res.status,200,item.path+' must keep URL and return 200 (not redirect)');
  const html=await res.text();
  assert.match(res.headers.get('content-type')||'',/text\/html/i);
  assert.match(html,/<title>[^<]+<\/title>/i);
  assert.match(html,/<link\b[^>]*rel="canonical"/i);
  if(item.expected)assert.ok(html.includes(item.expected),'Expected server-rendered title missing');
  console.log('PASS',item.path);
 }
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
