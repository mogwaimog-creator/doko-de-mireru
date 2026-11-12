'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const root=join(__dirname,'..');
const read=path=>readFileSync(join(root,path),'utf8');

test('temporary person navigation pause keeps person results visible without a clickable detail link',()=>{
 const html=read('index.html');
 assert.match(html,/class="person-search-result"/);
 assert.doesNotMatch(html,/href="\.\/person\.html\?id=/);
 assert.match(html,/person-search-name/);
});

test('person ledger write pause preserves cached profiles and avoids person-ledger writes',()=>{
 const src=read('api/_release-application.js');
 assert.match(src,/PERSON_LEDGER_WRITES_PAUSED==='1'/);
 assert.match(src,/if\(saved\?\.person\)return saved\.person/);
 assert.match(src,/Temporarily freeze person ledger writes only/);
});

test('old strict guard reservations are not restored',()=>{
 const guard=require('../api/_acquisition-guard');
 assert.doesNotMatch(guard.ADMIT,/inflight|commandReservation|byteReservation|paused=true/);
 assert.equal('FINISH' in guard,false);
 assert.equal('TRIP' in guard,false);
});

test('production release is opt-in; legacy mode remains supported',()=>{
 const src=read('api/_release-dispatch.js');
 assert.match(src,/mode===undefined\|\|mode==='legacy'/);
 assert.match(src,/\['new','paused'\]/);
});
