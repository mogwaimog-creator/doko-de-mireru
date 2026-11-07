'use strict';
const assert = require('node:assert/strict');
const { resolveRelatedWorks } = require('../api/_related-work-resolver');
const a = { type:'movie', id:10, title:'First', posterPath:'/first.jpg' };
const b = { type:'movie', id:11, title:'Second' };
const tv = { type:'tv', id:10, title:'TV' };
const result = resolveRelatedWorks(
  [{type:'movie',id:11},{type:'movie',id:10},{type:'movie',id:11},{type:'tv',id:10},{type:'movie',id:99}],
  [a,b,tv]
);
assert.deepEqual(result.works,[b,a,tv]);
assert.deepEqual(result.missing,[{type:'movie',id:99}]);
assert.notEqual(result.works[1],result.works[2]);
assert.equal(result.works[1].posterPath,'/first.jpg');
assert.deepEqual(resolveRelatedWorks([],[]),{works:[],missing:[]});
assert.throws(()=>resolveRelatedWorks([{type:'movie',id:0}],[]),/Invalid/);
assert.throws(()=>resolveRelatedWorks([{type:'person',id:10}],[]),/Invalid/);
assert.throws(()=>resolveRelatedWorks(null,[]),/Invalid/);
console.log('related-work resolver: 8 assertions passed');
