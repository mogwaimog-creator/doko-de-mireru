'use strict';
const assert=require('node:assert/strict');
const {getCachedSeason}=require('../api/_season-ledger-cache');
const {seasonResponse}=require('../api/_season-ledger-response');
const {fromTmdbSeason}=require('../api/_season-ledger-cache');
const now=Date.parse('2026-11-07T00:00:00Z');
const raw={season_number:2,name:'第2シーズン',episodes:[{episode_number:1,name:'第1話',air_date:'2026-11-01',runtime:42,overview:'あらすじ'}]};
(async()=>{
 let stored=null,fetchCount=0;
 const deps={type:'tv',id:88,seasonNumber:2,now,
 getRecord:async()=>stored,
 putRecordIfAbsent:async record=>{stored=JSON.parse(JSON.stringify(record));return true;},
 fetchSeason:async()=>{fetchCount++;return raw;}};
 const first=await getCachedSeason(deps);
 assert.equal(fetchCount,1);
 assert.equal(stored.checkedAt,new Date(now).toISOString());
 assert.equal(stored.status,'unknown');
 assert.deepEqual(first,seasonResponse(stored));
 const later=fromTmdbSeason(88,2,{...raw,name:'更新済み',episodes:[{...raw.episodes[0],name:'更新した第1話'}]});
 const updated={...later,checkedAt:new Date(now+8*86400000).toISOString(),status:stored.status};
 assert.deepEqual(Object.keys(updated).sort(),Object.keys(stored).sort(),'initial and refreshed records must share schema');
 stored=JSON.parse(JSON.stringify(updated));
 const second=await getCachedSeason({...deps,now:now+8*86400000});
 assert.deepEqual(second,seasonResponse(updated));
 assert.equal(fetchCount,1,'cached record must not fetch without opt-in refresh writer');
 console.log('season initial/refresh record schema compatibility tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});
