'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {store}=require('../prototype/streaming-ledger');
const {attachSeriesStreaming}=require('../prototype/detail-series-payload');
test('server payload supplies cached Japan flatrate to existing detail response',()=>{
 const ledger=store();ledger.register('movie',42);
 ledger.success('movie',42,{JP:{flatrate:[{provider_id:8,provider_name:'配信A',logo_path:'/a.png'}],rent:[],buy:[]}},'2026-11-08T06:00:00Z');
 const original={id:1,series:{movies:[{id:42,title:'関連作品'},{id:43,title:'未取得'}]}};
 const result=attachSeriesStreaming(original,ledger);
 assert.equal(result.seriesStreamingByWork['movie:42'][0].provider_id,8);
 assert.equal(Object.prototype.hasOwnProperty.call(result.seriesStreamingByWork,'movie:43'),false);
 assert.equal(original.seriesStreamingByWork,undefined);
});
test('server payload separates movie and TV and preserves confirmed empty',()=>{
 const ledger=store();ledger.register('tv',42);
 ledger.success('tv',42,{JP:{flatrate:[],rent:[],buy:[]}},'2026-11-08T06:00:00Z');
 const result=attachSeriesStreaming({series:[{id:42,title:'ドラマ',content_type:'tv'},{id:42,title:'映画'}]},ledger);
 assert.deepEqual(result.seriesStreamingByWork['tv:42'],[]);
 assert.equal(Object.prototype.hasOwnProperty.call(result.seriesStreamingByWork,'movie:42'),false);
});
