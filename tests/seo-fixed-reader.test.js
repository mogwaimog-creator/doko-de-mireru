'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readFixedDetail}=require('../scripts/read-seo-fixed-detail');
function doc(data,type='application/json'){
 return {getElementById(key){return key==='doko-fixed-detail'?{getAttribute(name){return name==='type'?type:null;},textContent:JSON.stringify(data)}:null;}};
}
const payload={type:'movie',id:77,metadata:{id:77,title:'映画A',poster_path:'/p.jpg'}};
test('reads valid fixed detail with exact movie identity',()=>{
 assert.deepEqual(readFixedDetail(doc(payload),'movie',77),payload.metadata);
 assert.equal(readFixedDetail(doc(payload),'tv',77),null);
 assert.equal(readFixedDetail(doc(payload),'movie',78),null);
});
test('rejects invalid JSON, script types, and dynamic provider fields',()=>{
 assert.equal(readFixedDetail(doc(payload,'text/javascript'),'movie',77),null);
 assert.equal(readFixedDetail({getElementById(){return {getAttribute(){return 'application/json';},textContent:'{bad'};}},'movie',77),null);
 assert.equal(readFixedDetail(doc({...payload,metadata:{...payload.metadata,'watch/providers':{}}}),'movie',77),null);
 assert.equal(readFixedDetail(doc({...payload,metadata:{...payload.metadata,streaming:[]}}),'movie',77),null);
 assert.equal(readFixedDetail(doc({...payload,metadata:{...payload.metadata,id:88}}),'movie',77),null);
 assert.equal(readFixedDetail(doc(payload),'movie','../77'),null);
});
