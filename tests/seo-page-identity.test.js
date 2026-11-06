'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resolvePageIdentity}=require('../scripts/seo-page-identity');
test('existing query URLs still resolve',()=>{
 assert.deepEqual(resolvePageIdentity('?id=50014'),{id:50014,type:'movie'});
 assert.deepEqual(resolvePageIdentity('?id=202879&type=tv'),{id:202879,type:'tv'});
});
test('prebuilt page can resolve without query parameters',()=>{
 assert.deepEqual(resolvePageIdentity('',{id:50014,type:'movie'}),{id:50014,type:'movie'});
 assert.deepEqual(resolvePageIdentity('',{id:202879,type:'tv'}),{id:202879,type:'tv'});
 assert.deepEqual(resolvePageIdentity('',{id:42,type:'person'}),{id:42,type:'person'});
});
test('reject invalid IDs, invalid types and conflicting embedded records',()=>{
 assert.equal(resolvePageIdentity('?id=../1'),null);
 assert.equal(resolvePageIdentity('?id=0'),null);
 assert.equal(resolvePageIdentity('?id=1&type=bad'),null);
 assert.equal(resolvePageIdentity('?id=77',{id:88,type:'movie'}),null);
 assert.equal(resolvePageIdentity('?id=77&type=tv',{id:77,type:'movie'}),null);
});
