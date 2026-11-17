'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const rosters=require('../data/watch-order-memberships.json');
test('all 13 scheduled series contain 266 unique movie/TV works',()=>{
 const names=Object.keys(rosters),entries=Object.values(rosters).flat();
 assert.equal(names.length,13);
 assert.equal(entries.length,266);
 assert.equal(new Set(entries.map(x=>x.type+':'+x.id)).size,266);
 for(const item of entries){assert(['movie','tv'].includes(item.type));assert(Number.isInteger(item.id)&&item.id>0)}
});
test('scheduled series includes Kimetsu and all expected catalog groups',()=>{
 for(const name of ['godzilla','mcu','jurassic','harrypotter','lordoftherings','starwars','wildspeed','minions','odoru','eva','conan','gundam','kimetsu'])assert(rosters[name]?.length>0,name);
});
