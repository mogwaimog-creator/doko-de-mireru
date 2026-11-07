'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeLinks,normalizeEditorial,mergeAutomatic,removalPlan}=require('../api/_work-ledger-editorial');
const {normalizeWork}=require('../api/_work-ledger');
test('same work linked from multiple features without duplicating metadata',()=>{
 const links=normalizeLinks([
  {kind:'watchOrder',type:'movie',id:603,scope:'mcu'},
  {kind:'watchOrder',type:'movie',id:603,scope:'mcu'},
  {kind:'feature',type:'movie',id:603,scope:'classic'}
 ]);
 assert.equal(links.length,2);
 assert.deepEqual(links.map(l=>l.scope),['mcu','classic']);
});
test('invalid references and scopes rejected',()=>{
 assert.throws(()=>normalizeLinks([{kind:'related',type:'movie',id:-1}]));
 assert.throws(()=>normalizeLinks([{kind:'feature',type:'movie',id:1,scope:'../../secret'}]));
});
test('confirmed and locked manual fields are protected from automatic updates',()=>{
 const existing={type:'movie',id:1,title:'Manual',overview:'Old',editorial:{locks:{title:true}}};
 const incoming={type:'movie',id:1,title:'Remote',overview:'New'};
 assert.deepEqual([mergeAutomatic(existing,incoming).title,mergeAutomatic(existing,incoming).overview],['Manual','New']);
 assert.equal(mergeAutomatic({...existing,editorial:{confirmed:true}},incoming).overview,'Old');
});
test('new work record stores references and editorial status',()=>{
 const record=normalizeWork('movie',1,{title:'Sample',relatedWorkIds:[{kind:'related',type:'tv',id:2}],editorial:{confirmed:true,locks:{title:true}}});
 assert.equal(record.relatedWorkIds[0].type,'tv');
 assert.equal(record.editorial.confirmed,true);
 assert.deepEqual(record.editorial.lockedFields,['title']);
});
test('removal plan does not mutate source',()=>{
 const source={title:'X',seasons:[{id:1}],extensions:{tmdbDetail:{id:1}}};
 const plan=removalPlan(source);
 assert.equal(plan.length,2);
 assert.equal(source.seasons.length,1);
 assert.equal(plan[0].action,'move-to-season-ledger-before-removal');
});
