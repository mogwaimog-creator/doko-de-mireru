'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DYNAMIC_FIELDS,splitDetailResponse,mergeDetailResponse}=require('../scripts/seo-detail-response-contract');
const source=fs.readFileSync(path.join(__dirname,'../api/search.js'),'utf8');
function responseKeys(fnName){
 const start=source.indexOf('async function '+fnName+'(');
 assert.ok(start>=0,'Missing '+fnName);
 const begin=source.indexOf('return {',start);
 const end=source.indexOf('\n  };',begin);
 assert.ok(begin>start&&end>begin,'Missing response object for '+fnName);
 const block=source.slice(begin,end);
 return [...new Set([...block.matchAll(/^ {2,8}([a-z_]+):\s*$/gm)].map(m=>m[1]))];
}
test('actual movie and TV response fields include all provider-dependent contract keys',()=>{
 for(const name of ['getMovieDetail','getTvDetail']){
  const keys=responseKeys(name);
  for(const key of ['streaming','rental','purchase'])assert.ok(keys.includes(key),name+' missing '+key);
  const fixture={id:77};
  for(const key of keys)fixture[key]=['streaming','rental','purchase'].includes(key)?[]:null;
  const {fixed,dynamic}=splitDetailResponse(fixture);
  for(const key of keys.filter(key=>DYNAMIC_FIELDS.includes(key))){
   assert.ok(Object.hasOwn(dynamic,key),name+' failed to split '+key);
   assert.equal(Object.hasOwn(fixed,key),false);
  }
  assert.deepEqual(mergeDetailResponse(fixed,dynamic),fixture);
 }
});
test('provider-derived fields in real API responses are declared dynamic',()=>{
 const expected=['netflix','amazon','fod','google_play','netflix_url','amazon_url','unext_url','hulu_url','disney_url','apple_tv_url','apple_url','fod_url','google_play_url'];
 const actual=new Set([...responseKeys('getMovieDetail'),...responseKeys('getTvDetail')]);
 for(const field of expected)if(actual.has(field))assert.ok(DYNAMIC_FIELDS.includes(field),'Missing dynamic field '+field);
});
