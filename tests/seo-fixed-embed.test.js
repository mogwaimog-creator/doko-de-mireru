'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {embedFixedMetadata}=require('../scripts/embed-seo-fixed-detail');
const {build}=require('../scripts/build-seo-static');
const row={schemaVersion:1,type:'movie',id:77,title:'映画A',extensions:{tmdbDetail:{id:77,title:'映画A',overview:'</script><script>alert(1)</script>',poster_path:'/p.jpg','watch/providers':{results:{JP:{flatrate:[{provider_id:8}]}}}}}};
test('embeds safe inert JSON with no streaming information',()=>{
 const html=embedFixedMetadata('<html><head></head><body></body></html>',row);
 assert.equal((html.match(/<script/g)||[]).length,1);
 assert.doesNotMatch(html,/<script>alert/);
 assert.doesNotMatch(html,/watch\/providers/);
 const payload=html.match(/<script type="application\/json" id="doko-fixed-detail">([^<]*)<\/script>/)[1];
 const data=JSON.parse(payload);
 assert.equal(data.metadata.overview,'</script><script>alert(1)</script>');
 assert.equal(data.metadata.poster_path,'/p.jpg');
});
test('generator embeds fixed data for complete ledger but not legacy SEO-only records',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'doko-embed-'));
 try{
  const input=path.join(dir,'records.json'),output=path.join(dir,'out');
  await fs.writeFile(input,JSON.stringify([row,{kind:'work',type:'tv',id:9,title:'TV'}]));
  await build(input,output);
  const movieHtml=await fs.readFile(path.join(output,'movie-77.html'),'utf8');
  assert.match(movieHtml,/doko-fixed-detail/);
  assert.match(movieHtml,/window.dokoReadFixedDetail=readFixedDetail/);
  assert.match(movieHtml,/async function loadMovie/);
  assert.match(movieHtml,/await fetch/);
  assert.match(movieHtml,/detailFormat=split/);
  assert.match(movieHtml,/dokoMergeDetailResponse\(movie.fixed, movie.dynamic\)/);
  const inlineScripts=[...movieHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(m=>m[1]).filter(Boolean);
  for(const script of inlineScripts){
    if(script.includes('const movieId')||script.includes('window.dokoMergeDetailResponse')){
      assert.doesNotThrow(()=>new vm.Script(script), 'Generated browser script must parse');
    }
  }
  assert.doesNotMatch(await fs.readFile(path.join(output,'tv-9.html'),'utf8'),/doko-fixed-detail/);
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
