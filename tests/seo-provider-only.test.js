'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {project}=require('../api/detail-providers-only');
test('provider-only response includes Japanese availability but no work metadata',()=>{
 const data={results:{JP:{link:'https://www.themoviedb.org/movie/77/watch',flatrate:[{provider_id:8,provider_name:'Netflix',logo_path:'/logo.png'}],rent:[{provider_id:9,provider_name:'Prime Video'}],buy:[]},US:{flatrate:[{provider_name:'US only'}]}}};
 const output=project(data,'movie',77);
 assert.deepEqual(output.streaming,[{provider_id:8,provider_name:'Netflix',logo_path:'/logo.png',provider_url:null}]);
 assert.equal(output.rental[0].provider_name,'Prime Video');
 assert.deepEqual(output.purchase,[]);
 assert.equal(output.providerPageUrl,data.results.JP.link);
 assert.equal(Object.hasOwn(output,'title'),false);
 assert.equal(Object.hasOwn(output,'poster_path'),false);
 assert.equal(JSON.stringify(output).includes('US only'),false);
});
test('empty Japanese availability remains empty, not inferred',()=>{
 const result=project({results:{}},'tv',100);
 assert.deepEqual(result.streaming,[]);
 assert.deepEqual(result.rental,[]);
 assert.deepEqual(result.purchase,[]);
 assert.equal(result.providerPageUrl,null);
});

test('provider-only pilot is off by default and never touches upstream',async()=>{
 const handler=require('../api/detail-providers-only');
 const previous=process.env.SEO_PROVIDER_ONLY_ENABLED;
 const oldLedger=process.env.WORK_LEDGER_ENABLED;
 const oldFetch=global.fetch;
 try{
  delete process.env.SEO_PROVIDER_ONLY_ENABLED;
  process.env.WORK_LEDGER_ENABLED='1';
  global.fetch=()=>{throw Error('Unexpected network call')};
  let status,body;
  const res={setHeader(){},status(code){status=code;return this;},json(value){body=value;return this;}};
  await handler({method:'GET',query:{type:'movie',id:'77'}},res);
  assert.equal(status,404);
  assert.equal(body.error,'Provider-only pilot disabled');
 }finally{
  if(previous===undefined)delete process.env.SEO_PROVIDER_ONLY_ENABLED;
  else process.env.SEO_PROVIDER_ONLY_ENABLED=previous;
  if(oldLedger===undefined)delete process.env.WORK_LEDGER_ENABLED;
  else process.env.WORK_LEDGER_ENABLED=oldLedger;
  global.fetch=oldFetch;
 }
});
