'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseSeo,MAX_VALUE_BYTES}=require('../api/_seo-ledger');
test('parse saved compact SEO record',()=>{
 assert.deepEqual(parseSeo(JSON.stringify({v:1,t:'作品タイトル',d:'説明'})),{title:'作品タイトル',description:'説明'});
});
test('reject missing, corrupt, obsolete and oversized records without any network call',()=>{
 assert.equal(parseSeo(null),null);
 assert.equal(parseSeo('{bad'),null);
 assert.equal(parseSeo(JSON.stringify({v:2,t:'A',d:'B'})),null);
 assert.equal(parseSeo(JSON.stringify({v:1,t:'',d:'B'})),null);
 assert.equal(parseSeo(JSON.stringify({v:1,t:'A',d:'x'.repeat(MAX_VALUE_BYTES)})),null);
});
