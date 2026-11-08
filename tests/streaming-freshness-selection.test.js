'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {selectWatch,detailState}=require('../api/_streaming-state');
const now=Date.parse('2026-11-10T00:00:00Z');
const candidate=(at,ids=[])=>({checkedAt:at,flatrate:ids.map(id=>({provider_id:id})),stale:now-Date.parse(at)>=86400000});
test('newer legacy success beats stale shared success; newer shared beats legacy, ties prefer shared',()=>{
 const old=candidate('2026-11-08T00:00:00Z',[8]),fresh=candidate('2026-11-09T23:00:00Z',[9]);
 assert.equal(selectWatch(old,fresh,now).flatrate[0].provider_id,9);assert.equal(selectWatch(fresh,old,now).flatrate[0].provider_id,9);
 assert.equal(selectWatch({...fresh,flatrate:[{provider_id:1}]},fresh,now).flatrate[0].provider_id,1);
 assert.equal(selectWatch(null,{...fresh,checkedAt:'2030-01-01'},now),null);
});
test('empty successful legacy result remains confirmed; failed/unknown is not empty success',()=>{
 const empty=detailState(null,candidate('2026-11-09T23:00:00Z'),null,now);
 assert.equal(empty.meta.status,'fresh');assert.equal(empty.meta.flatrateEmpty,true);assert.deepEqual(empty.meta.coverage,['flatrate']);assert(!Object.hasOwn(empty.data.results.JP,'rent'));
 assert.equal(detailState(null,null,null,now).meta.status,'unknown');
 const failed=detailState({attempt:{failed:true,at:'2026-11-09T23:30:00Z'}},null,null,now);assert.equal(failed.meta.status,'failed');assert.equal(failed.meta.flatrateEmpty,false);
});
test('partial new watch information retains older rent/buy with separate timestamps and stale warning',()=>{
 const shared={watch:candidate('2026-11-09T23:00:00Z',[9]),detail:null};
 const detail={data:{results:{JP:{flatrate:[{provider_id:8}],rent:[{provider_id:2}],buy:[]}}},checkedAt:'2026-11-08T00:00:00Z'};
 const result=detailState(shared,null,detail,now);assert.equal(result.data.results.JP.flatrate[0].provider_id,9);assert.equal(result.data.results.JP.rent[0].provider_id,2);assert.equal(result.meta.status,'stale');assert.equal(result.meta.categoryCheckedAt.rent,detail.checkedAt);
});
test('failed refresh retains prior success and labels failure, malformed legacy is not empty success',()=>{
 const r=detailState({attempt:{failed:true,at:'2026-11-09T23:30:00Z'}},candidate('2026-11-09T23:00:00Z',[8]),null,now);
 assert.equal(r.meta.status,'stale');assert.equal(r.meta.refreshFailed,true);assert.equal(r.data.results.JP.flatrate[0].provider_id,8);
 assert.equal(detailState(null,null,{checkedAt:'2026-11-09T23:00:00Z',data:{results:{JP:[]}}},now).meta.status,'unknown');
});
test('missing JP or flatrate in legacy copies never proves zero; known partial rental data survives',()=>{
 const at='2026-11-09T23:00:00Z';assert.equal(detailState(null,null,{data:{results:{}},checkedAt:at},now).meta.status,'unknown');
 const result=detailState(null,null,{data:{results:{JP:{rent:[{provider_id:2}]}}},checkedAt:at},now);
 assert.deepEqual(result.meta.coverage,['rent']);assert.equal(result.meta.flatrateEmpty,false);assert.equal(result.data.results.JP.rent[0].provider_id,2);assert(!Object.hasOwn(result.data.results.JP,'flatrate'));
});
