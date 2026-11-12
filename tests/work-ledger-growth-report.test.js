'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {snapshot,compare}=require('../prototype/work-ledger-growth-report');
function ledger(items, errors=0) {return {audit:()=>({count:items.length,totalBytes:items.reduce((n,x)=>n+x.bytes,0),errorCount:errors,errorBytes:errors*20,items})}}
test('unchanged snapshots report no growth',()=>{const a=snapshot(ledger([{key:'movie:1',bytes:100}]));const b=snapshot(ledger([{key:'movie:1',bytes:100}]));const r=compare(a,b);assert.equal(r.totalBytesDelta,0);assert.deepEqual(r.changes,[])});
test('flags unexpected per-record growth, not new records',()=>{const a=snapshot(ledger([{key:'movie:1',bytes:100}]));const b=snapshot(ledger([{key:'movie:1',bytes:5100},{key:'tv:2',bytes:400}]));const r=compare(a,b);assert.deepEqual(r.growthWarnings.map(x=>x.key),['movie:1']);assert.equal(r.countDelta,1);assert.equal(r.totalBytesDelta,5400)});
test('reports removed records and error growth',()=>{const a=snapshot(ledger([{key:'movie:1',bytes:100}],0));const b=snapshot(ledger([],2));const r=compare(a,b);assert.deepEqual(r.removedKeys,['movie:1']);assert.equal(r.errorCountDelta,2)});
test('does not mutate original snapshot or ledger',()=>{const l=ledger([{key:'movie:1',bytes:100}]);const a=snapshot(l);const json=JSON.stringify(a);compare(a,snapshot(l));assert.equal(JSON.stringify(a),json)});
