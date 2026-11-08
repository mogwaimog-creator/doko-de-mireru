'use strict';const {test}=require('node:test');const assert=require('node:assert/strict');
const {service}=require('../prototype/streaming-ledger-service');
const {redisStreamingStore}=require('../prototype/streaming-ledger-redis');
function mock(){
 const values=new Map();
 const command=async a=>{const [op,...v]=a;if(op==='GET')return values.get(v[0])??null;
 if(op==='SET'){if(v.includes('NX')&&values.has(v[0]))return null;values.set(v[0],v[1]);return 'OK'}
 if(op==='EVAL'){const [_,n,...args]=v;if(Number(n)===1){if(values.get(args[0])!==args[1])return 0;values.delete(args[0]);return 1}
 if(values.get(args[0])!==args[2])return 0;values.set(args[1],args[3]);return 1}
 throw Error(op)};
 return redisStreamingStore(command)
}
const payload={results:{JP:{flatrate:[{provider_id:8,provider_name:'Netflix',logo_path:'/a.png'}]}}};
test('first visit persists normalized JP record, second visit uses cache',async()=>{
 const db=mock();let calls=0;const s=service(db,async()=>{calls++;return payload});
 const a=await s.visit('movie',1,'2026-11-07T02:00:00Z',[]);
 assert.equal(a.updated,true);assert.equal(a.record.japan.flatrate[0].providerId,8);
 assert.equal((await s.visit('movie',1,'2026-11-07T03:00:00Z',[])).reason,'cached');
 assert.equal(calls,1);
});
test('series updates at 06 JST and not during visits',async()=>{
 const db=mock();let calls=0;const works=[{type:'movie',id:1,memberships:[{kind:'watchOrder'}]}];const s=service(db,async()=>{calls++;return payload});
 assert.equal((await s.visit('movie',1,'2026-11-06T22:00:00Z',works)).reason,'series-uses-cron');
 assert.equal((await s.cron('2026-11-06T21:00:00Z',works))[0].updated,true);
 assert.equal((await s.cron('2026-11-06T22:00:00Z',works))[0].reason,'already-processed-today');
 assert.equal(calls,1);
});
test('write freeze keeps previous success and prevents TMDB call',async()=>{
 const db=mock();let enabled=true,calls=0;const s=service(db,async()=>{calls++;return payload},{writesEnabled:()=>enabled});
 const a=await s.visit('tv',5,'2026-11-06T00:00:00Z',[]);
 enabled=false;const b=await s.visit('tv',5,'2026-11-07T01:00:00Z',[]);
 assert.equal(b.reason,'writes-disabled');assert.equal((await db.read('tv:5')).lastSuccessAt,a.record.lastSuccessAt);assert.equal(calls,1);
});
test('failed refresh preserves previously saved data',async()=>{
 const db=mock();let fail=false;const s=service(db,async()=>{if(fail)throw Error('upstream failed');return payload});
 const a=await s.visit('movie',6,'2026-11-06T00:00:00Z',[]);fail=true;
 assert.equal((await s.visit('movie',6,'2026-11-07T01:00:00Z',[])).reason,'failed');
 assert.equal((await db.read('movie:6')).lastSuccessAt,a.record.lastSuccessAt);
});

test('cron isolates a Redis read failure and processes remaining series works',async()=>{
 const db=mock(),read=db.read;let calls=0;
 db.read=async key=>{if(key==='movie:1')throw Error('temporary Redis outage');return read(key)};
 const works=[1,2,3].map(id=>({type:'movie',id,memberships:[{kind:'watchOrder'}]}));
 const s=service(db,async()=>{calls++;return payload},{maxConcurrency:2});
 const results=await s.cron('2026-11-06T21:00:00Z',works);
 assert.equal(results.length,3);
 assert.equal(results[0].reason,'infrastructure-error');
 assert.equal(results[1].updated,true);
 assert.equal(results[2].updated,true);
 assert.equal(calls,2);
 assert.ok(await db.read('movie:2'));
 assert.ok(await db.read('movie:3'));
});
test('release failure cannot mask successful saved streaming data',async()=>{
 const db=mock(),release=db.release;
 db.release=async()=>{throw Error('unlock unavailable')};
 const s=service(db,async()=>payload);
 const result=await s.visit('movie',8,'2026-11-06T00:00:00Z',[]);
 assert.equal(result.updated,true);
 assert.equal((await db.read('movie:8')).lastSuccessAt,result.record.lastSuccessAt);
 db.release=release;
});
test('release failure cannot mask original fetch error or replace old data',async()=>{
 const db=mock();let fail=false;
 const s=service(db,async()=>{if(fail)throw Error('TMDB unavailable');return payload});
 const first=await s.visit('movie',9,'2026-11-06T00:00:00Z',[]);
 db.release=async()=>{throw Error('unlock unavailable')};fail=true;
 const second=await s.visit('movie',9,'2026-11-07T01:00:00Z',[]);
 assert.equal(second.reason,'failed');
 assert.match(second.error,/TMDB unavailable/);
 assert.equal((await db.read('movie:9')).lastSuccessAt,first.record.lastSuccessAt);
});
