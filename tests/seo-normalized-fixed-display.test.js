'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeFixedDisplayRecord,validateFixedDisplayRecord}=require('../scripts/seo-normalized-fixed-display');
test('offline display-ready fixed record preserves existing normalized fields',()=>{
 const detail={id:42,title:'映画',director:'監督',cast:[{name:'出演'}],poster_path:'/a.jpg',streaming:[],rental:[],purchase:[],amazon_url:'https://example.org'};
 const record=normalizeFixedDisplayRecord('movie',42,detail);
 assert.deepEqual(validateFixedDisplayRecord(record,'movie',42),{id:42,title:'映画',director:'監督',cast:[{name:'出演'}],poster_path:'/a.jpg'});
 assert.equal(Object.hasOwn(record.fixed,'amazon_url'),false);
});
test('rejects raw, incomplete, or mismatched records',()=>{
 assert.throws(()=>normalizeFixedDisplayRecord('movie',42,{id:42,title:'映画',poster_path:'/a.jpg'}),/provider/);
 assert.throws(()=>normalizeFixedDisplayRecord('tv',43,{id:42,title:'TV',streaming:[],rental:[],purchase:[]}),/identity/);
 assert.throws(()=>validateFixedDisplayRecord({schemaVersion:1,type:'movie',id:42,fixed:{id:42,title:'映画',streaming:[]}},'movie',42),/Provider/);
});
