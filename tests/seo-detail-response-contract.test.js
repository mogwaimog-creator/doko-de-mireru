'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {splitDetailResponse,mergeDetailResponse}=require('../scripts/seo-detail-response-contract');
test('full movie response round trips without losing cast, collection or providers',()=>{
 const full={id:77,title:'映画A',cast:[{name:'俳優'}],director:'監督',collection:{id:9},poster_path:'/x.jpg',streaming:[{provider_id:8}],rental:[],purchase:[{provider_id:2}],netflix_url:'https://example.com/netflix',amazon:{url:'https://example.com/prime'},apple_tv_url:'https://example.com/apple',fod:{url:'https://example.com/fod'},google_play:{url:'https://example.com/google'}};
 const {fixed,dynamic}=splitDetailResponse(full);
 assert.deepEqual(mergeDetailResponse(fixed,dynamic),full);
 assert.equal(Object.hasOwn(fixed,'streaming'),false);
 assert.equal(Object.hasOwn(fixed,'rental'),false);
 assert.equal(Object.hasOwn(fixed,'purchase'),false);
 assert.equal(Object.hasOwn(fixed,'netflix_url'),false);
 assert.equal(Object.hasOwn(fixed,'amazon'),false);
 assert.equal(dynamic.netflix_url,full.netflix_url);
 for(const field of ['apple_tv_url','fod','google_play'])assert.equal(Object.hasOwn(fixed,field),false);
});
test('TV response retains season fields and distinct provider arrays',()=>{
 const full={id:9,title:'TV',seasons:[{season_number:1}],media_type:'アニメ',streaming:[],rental:[{provider_id:1}],purchase:[]};
 assert.deepEqual(mergeDetailResponse(...Object.values(splitDetailResponse(full))),full);
});
test('reject missing provider information and mismatched IDs rather than displaying no availability',()=>{
 assert.throws(()=>splitDetailResponse({id:1,title:'X',streaming:[]}),/Missing provider/);
 assert.throws(()=>mergeDetailResponse({id:1,title:'X'},{id:2,streaming:[],rental:[],purchase:[]}),/identity/);
 assert.throws(()=>mergeDetailResponse({id:1,streaming:[]},{id:1,streaming:[],rental:[],purchase:[]}),/fixed record/);
});
