'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {displayProviders}=require('../scripts/seo-provider-display-prototype');
test('provider display prototype maps lists and link fields without metadata',()=>{
 const input={id:77,streaming:[{provider_name:'Netflix',provider_id:8},{provider_name:'Amazon Prime Video',provider_id:9}],rental:[{provider_name:'FOD',provider_id:10}],purchase:[]};
 const result=displayProviders(input,'映画タイトル','movie');
 assert.equal(result.id,77);
 assert.deepEqual(result.streaming,input.streaming);
 assert.equal(result.netflix_url,'https://www.netflix.com/jp/search');
 assert.equal(result.amazon_url,'https://www.amazon.co.jp/s?k='+encodeURIComponent('映画タイトル')+'&i=instant-video');
 assert.equal(result.fod_url,'https://fod.fujitv.co.jp/');
 assert.equal(result.unext_url,null);
 assert.equal(Object.hasOwn(result,'title'),false);
 assert.equal(Object.hasOwn(result,'poster_path'),false);
});
test('provider display prototype refuses incomplete lists',()=>{
 assert.throws(()=>displayProviders({id:77,streaming:[]},'Title','tv'),/Incomplete providers/);
});
