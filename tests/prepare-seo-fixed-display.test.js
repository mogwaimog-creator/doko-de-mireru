'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {convert}=require('../scripts/prepare-seo-fixed-display');
test('adapts existing movie and TV API display responses without storing providers',()=>{
 const rows=[{type:'movie',id:7,detail:{id:7,title:'映画',director:'監督',streaming:[],rental:[],purchase:[]}},
 {type:'tv',id:7,detail:{id:7,title:'ドラマ',seasons:[],streaming:[],rental:[],purchase:[]}}];
 const result=convert(rows);
 assert.equal(result.length,2);
 assert.equal(result[0].fixed.director,'監督');
 assert.deepEqual(result[1].fixed.seasons,[]);
 assert.equal(Object.hasOwn(result[0].fixed,'streaming'),false);
});
test('rejects duplicate and incomplete records before output',()=>{
 const row={type:'movie',id:7,detail:{id:7,title:'映画',director:'監督',streaming:[],rental:[],purchase:[]}};
 assert.throws(()=>convert([row,row]),/Duplicate/);
 assert.throws(()=>convert([{...row,detail:{id:7,title:'映画'}}]),/provider/);
});
