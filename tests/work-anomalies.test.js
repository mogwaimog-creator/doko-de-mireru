'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {differences,anomalyKey}=require('../api/_work-anomalies');
test('same metadata creates no anomaly',()=>{
 assert.deepEqual(differences({title:'作品A',posterPath:'/a.jpg'},{title:'作品A',posterPath:'/a.jpg'}),[]);
});
test('records old and observed values for relevant changes',()=>{
 const changes=differences({title:'作品A',releaseDate:'2000-01-01',posterPath:'/a.jpg'},{title:'別作品',releaseDate:'2000-01-01',posterPath:'/b.jpg'});
 assert.deepEqual(changes.map(c=>c.field),['title','posterPath']);
 assert.equal(changes[0].previous,'"作品A"');
 assert.equal(changes[0].observed,'"別作品"');
});
test('movie and tv anomalies are separated',()=>{
 assert.notEqual(anomalyKey('movie',10),anomalyKey('tv',10));
});

test('detects cast changes beyond the shortened history preview',()=>{
 const cast=Array.from({length:25},(_,i)=>({name:'出演者'+i,role:'役名'+i}));
 const revised=cast.map(person=>({...person}));
 revised[24].role='新しい役名';
 const changes=differences({cast},{cast:revised});
 assert.equal(changes.length,1);
 assert.equal(changes[0].field,'cast');
 assert.ok(changes[0].previous.length<=351);
});
