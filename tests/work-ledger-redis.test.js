'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const redisPath=require.resolve('../api/_redis');
const ledgerPath=require.resolve('../api/_work-ledger');
const originalRedis=require.cache[redisPath];
const originalLedger=require.cache[ledgerPath];
const store=new Map();
let commands=[];
require.cache[redisPath]={id:redisPath,filename:redisPath,loaded:true,exports:{
  command:async(args)=>{
    commands.push(args);
    const [op,key,value,option]=args;
    if(op==='GET')return store.get(key)||null;
    if(op==='SET'){
      if(option==='NX' && store.has(key))return null;
      store.set(key,value);
      return 'OK';
    }
    if(op==='EVAL'){
      const [,script,numKeys,key,expected,next]=args;
      assert.equal(numKeys,'1');
      assert.match(script,/redis.call\('GET',KEYS\[1\]\)/);
      if(store.get(key)!==expected)return 0;
      store.set(key,next);return 1;
    }
    throw Error('Unexpected command '+op);
  }
}};
delete require.cache[ledgerPath];
const {getWork,putWork,putWorkIfAbsent}=require('../api/_work-ledger');
test.after(()=>{
 if(originalRedis)require.cache[redisPath]=originalRedis;
 else delete require.cache[redisPath];
 if(originalLedger)require.cache[ledgerPath]=originalLedger;
 else delete require.cache[ledgerPath];
});
test('first write wins and subsequent registration does not overwrite editorial changes',async()=>{
 store.clear();commands=[];
 const first=await putWorkIfAbsent('movie',88,{title:'初回作品',pageExtras:{guide:{order:1}}});
 assert.equal(first.title,'初回作品');
 const second=await putWorkIfAbsent('movie',88,{title:'別のタイトル',pageExtras:{guide:{order:2}}});
 assert.equal(second.title,'初回作品');
 assert.equal((await getWork('movie',88)).pageExtras.guide.order,1);
 assert.equal(commands.filter(args=>args[0]==='SET').length,2);
 assert.ok(commands.filter(args=>args[0]==='SET').every(args=>args[3]==='NX'));
});
test('same numeric ID for movie and TV creates independent records',async()=>{
 store.clear();
 await putWorkIfAbsent('movie',90,{title:'映画'});
 await putWorkIfAbsent('tv',90,{title:'テレビ'});
 assert.equal((await getWork('movie',90)).title,'映画');
 assert.equal((await getWork('tv',90)).title,'テレビ');
});
test('malformed existing record is not silently overwritten',async()=>{
 store.clear();
 store.set('doko:work:v1:movie:91','not valid JSON');
 await assert.rejects(putWorkIfAbsent('movie',91,{title:'新規'}));
 assert.equal(store.get('doko:work:v1:movie:91'),'not valid JSON');
});

test('review update changes verification only and retains fixed and internal data',async()=>{
 store.clear();commands=[];
 const original=await putWorkIfAbsent('movie',157336,{
  title:'インターステラー',overview:'保存済み概要',checkedAt:'2026-11-06T00:00:00.000Z',
  commonNotes:{editorial:'retain'},pageExtras:{guide:{text:'retain'}},
  extensions:{tmdbDetail:{id:157336,title:'インターステラー'}},
  verification:{items:{existing:'retain'},notes:'retain'}
 });
 commands=[];
 const verification={...original.verification,identity:'verified',metadata:'verified',
  items:{...original.verification.items,initialHtmlSeoReview:{checkedAt:'2026-11-06T12:00:00.000Z',castCount:30}}};
 const saved=await putWork('movie',157336,{...original,verification},{expected:original});
 assert.deepEqual(saved,{...original,verification});
 assert.deepEqual(await getWork('movie',157336),saved);
 assert.equal(commands.filter(a=>a[0]==='EVAL').length,1);
 assert.equal(commands.filter(a=>a[0]==='SET').length,0,'review never sends unconditional SET');
});
test('review conflict or deleted record preserves the latest data without recreating it',async()=>{
 store.clear();commands=[];
 const original=await putWorkIfAbsent('movie',157336,{title:'Before'});
 const latest={...original,title:'Concurrent editorial change'};
 store.set('doko:work:v1:movie:157336',JSON.stringify(latest));
 const update={...original,verification:{identity:'verified',metadata:'verified'}};
 await assert.rejects(putWork('movie',157336,update,{expected:original}),e=>e.code==='WORK_REVIEW_CONFLICT');
 assert.deepEqual(await getWork('movie',157336),latest);
 store.delete('doko:work:v1:movie:157336');
 await assert.rejects(putWork('movie',157336,update,{expected:original}),e=>e.code==='WORK_REVIEW_CONFLICT');
 assert.equal(store.has('doko:work:v1:movie:157336'),false);
 const count=commands.length;
 await assert.rejects(putWork('movie',157336,update,{expected:{...original,id:999}}),/identity mismatch/);
 assert.equal(commands.length,count,'wrong expected identity never contacts Redis');
});
