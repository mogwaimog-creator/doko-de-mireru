'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {attachCachedSeriesStreaming}=require('../prototype/redis-series-streaming-readonly');
function record(flatrate){return JSON.stringify({checkedAt:'2026-11-08T06:00:00Z',data:{results:{JP:{flatrate}}}});}
test('one MGET reads existing cache without writes or refresh',async()=>{
 const calls=[];
 const detail={series:{movies:[{id:42,title:'映画A'},{id:43,title:'映画B'}]}};
 const out=await attachCachedSeriesStreaming(detail,{now:Date.parse('2026-11-08T12:00:00Z'),command:async args=>{calls.push(args);return [record([{provider_id:8,provider_name:'配信A',logo_path:'/a.png'}]),null]}});
 assert.deepEqual(calls,[['MGET','doko:detail-providers:v1:movie:42','doko:detail-providers:v1:movie:43']]);
 assert.equal(out.seriesStreamingByWork['movie:42'][0].provider_id,8);
 assert.equal(Object.prototype.hasOwnProperty.call(out.seriesStreamingByWork,'movie:43'),false);
});
test('confirmed empty cache differs from missing or malformed record',async()=>{
 const detail={series:[{id:42,title:'ドラマ',content_type:'tv'},{id:43,title:'不明'}]};
 const out=await attachCachedSeriesStreaming(detail,{now:Date.parse('2026-11-08T12:00:00Z'),command:async()=>[record([]),'bad-json']});
 assert.deepEqual(out.seriesStreamingByWork['tv:42'],[]);
 assert.equal(Object.prototype.hasOwnProperty.call(out.seriesStreamingByWork,'movie:43'),false);
});
test('Redis failure returns original detail with no write',async()=>{
 const detail={series:[{id:42,title:'映画'}]};
 assert.equal(await attachCachedSeriesStreaming(detail,{now:Date.parse('2026-11-08T12:00:00Z'),command:async()=>{throw Error('unavailable')}}),detail);
});
test('duplicate cards read once and empty series makes no Redis request',async()=>{
 const calls=[];
 const command=async args=>{calls.push(args);return [record([])]};
 await attachCachedSeriesStreaming({series:[{id:42,title:'映画'},{id:42,title:'映画'}]},{command,now:Date.parse('2026-11-08T12:00:00Z')});
 await attachCachedSeriesStreaming({series:[]},{command});
 assert.equal(calls.length,1);
 assert.equal(calls[0].length,2);
});

test('stale cached empty result is not reported as confirmed no streaming',async()=>{
 const detail={series:[{id:42,title:'映画'}]};
 const out=await attachCachedSeriesStreaming(detail,{now:Date.parse('2026-11-10T12:00:00Z'),command:async()=>[record([])]});
 assert.equal(Object.prototype.hasOwnProperty.call(out.seriesStreamingByWork,'movie:42'),false);
});
test('fresh cached empty result remains confirmed no streaming',async()=>{
 const detail={series:[{id:42,title:'映画'}]};
 const out=await attachCachedSeriesStreaming(detail,{now:Date.parse('2026-11-08T12:00:00Z'),command:async()=>[record([])]});
 assert.deepEqual(out.seriesStreamingByWork['movie:42'],[]);
});

test('missing flatrate field is unknown, not confirmed empty',async()=>{
 const detail={series:[{id:42,title:'映画'}]};
 const raw=JSON.stringify({checkedAt:'2026-11-08T06:00:00Z',data:{results:{JP:{rent:[]}}}});
 const out=await attachCachedSeriesStreaming(detail,{now:Date.parse('2026-11-08T12:00:00Z'),command:async()=>[raw]});
 assert.equal(Object.prototype.hasOwnProperty.call(out.seriesStreamingByWork,'movie:42'),false);
});
test('future timestamp outside tolerance is unknown',async()=>{
 const detail={series:[{id:42,title:'映画'}]};
 const raw=JSON.stringify({checkedAt:'2026-11-09T06:00:00Z',data:{results:{JP:{flatrate:[]}}}});
 const out=await attachCachedSeriesStreaming(detail,{now:Date.parse('2026-11-08T12:00:00Z'),command:async()=>[raw]});
 assert.equal(Object.prototype.hasOwnProperty.call(out.seriesStreamingByWork,'movie:42'),false);
});
