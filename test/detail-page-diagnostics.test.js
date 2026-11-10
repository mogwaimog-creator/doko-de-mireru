'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../api/detail-page.js'),'utf8');
function handler(options){
 const module={exports:{}};
 const requireMock=name=>{
  if(name==='node:fs')return fs;
  if(name==='node:path')return path;
  if(name==='./_recovery-fixed-work')return {metadataUrl:()=>'',readWork:async()=>{throw Error('unexpected read')}};
  if(name==='./_recovery-fetch-cache')return {enabled:()=>false,devCommand:async()=>null};
  if(name==='../prototype/seo-ledger')return {createSeoRecord:x=>x};
  if(name==='../prototype/seo-detail-renderer')return {renderDetailHtml:(html,record)=>{
   if(html==='broken')throw Error('render failure');
   return '<html><title>'+record.title+'</title></html>';
  }};
  if(name==='./_recovery-initial-seo')return {projectSeo:async()=>null};
  throw Error('Unexpected import: '+name);
 };
 vm.runInNewContext('(function(require,module,exports,process,__dirname,fetch){'+source+'})',{})(
  requireMock,module,module.exports,{env:{}},path.join(__dirname,'../api'),
  async()=>{throw Error('network must not be called')}
 );
 return module.exports.createHandler({active:()=>true,cacheCommand:async()=>null,...options});
}
async function run(options){
 const diagnostics=[];
 const res={
  statusCode:200,headers:{},body:null,
  setHeader(k,v){this.headers[k]=v;return this},
  status(code){this.statusCode=code;return this},
  end(body){this.body=body;return this}
 };
 await handler({...options,onDiagnostic:d=>diagnostics.push(d)})(
  {method:'GET',query:{type:'tv',id:'1399'}},res
 );
 return {res,diagnostics};
}
test('saved TV SEO record renders without diagnostics',async()=>{
 const {res,diagnostics}=await run({
  project:async()=>({title:'保存済みドラマ'}),
  readFixed:async()=>{throw Error('must not read fallback')},
  template:()=>'<html></html>'
 });
 assert.equal(res.statusCode,200);
 assert.match(res.body,/保存済みドラマ/);
 assert.equal(diagnostics.length,0);
});
test('missing saved SEO projection has distinct stage and 503',async()=>{
 const {res,diagnostics}=await run({
  project:async()=>null,
  readFixed:async()=>{const e=Error('not saved');e.httpStatus=503;throw e}
 });
 assert.equal(res.statusCode,503);
 assert.equal(diagnostics.length,1);
 assert.equal(diagnostics[0].stage,'saved-seo-missing');
 assert.equal(diagnostics[0].category,'unavailable');
 assert.equal(res.headers['X-Robots-Tag'],'noindex');
});
test('Redis read exception has read-saved-work stage and 503',async()=>{
 const {res,diagnostics}=await run({
  project:async()=>{throw Error('simulated Redis failure')}
 });
 assert.equal(res.statusCode,503);
 assert.equal(diagnostics[0].stage,'read-saved-work');
 assert.equal(diagnostics[0].category,'unexpected');
 assert.doesNotMatch(res.body,/simulated Redis failure/);
});
test('render exception has render-html stage and 503',async()=>{
 const {res,diagnostics}=await run({
  project:async()=>({title:'保存済みドラマ'}),
  template:()=> 'broken'
 });
 assert.equal(res.statusCode,503);
 assert.equal(diagnostics[0].stage,'render-html');
 assert.equal(diagnostics[0].category,'unexpected');
});
