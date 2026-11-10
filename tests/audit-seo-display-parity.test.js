'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {convert}=require('../scripts/prepare-seo-fixed-display');
const {auditParity}=require('../scripts/audit-seo-display-parity');
const movie={type:'movie',id:11,detail:{id:11,title:'映画',director:'監督',cast:[{name:'出演者'}],poster_path:'/m.jpg',streaming:[{provider_id:8}],rental:[],purchase:[],netflix_url:'https://example.org'}};
const tv={type:'tv',id:12,detail:{id:12,title:'ドラマ',seasons:[{season_number:1}],media_type:'ドラマ',streaming:[],rental:[],purchase:[]}};
test('movie and TV display fields survive offline split and merge',()=>{
 const rows=[movie,tv];const result=auditParity(rows,convert(rows));
 assert.equal(result.total,2);assert.equal(result.passed,2);assert.deepEqual(result.failed,[]);
});
test('reports drift in director and seasons instead of silently publishing',()=>{
 const records=convert([movie,tv]);records[0].fixed.director='別の監督';records[1].fixed.seasons=[];
 const result=auditParity([movie,tv],records);
 assert.equal(result.passed,0);assert.equal(result.failed.length,2);
});
