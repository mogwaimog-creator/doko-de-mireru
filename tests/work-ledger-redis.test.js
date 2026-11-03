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
    throw Error('Unexpected command '+op);
  }
}};
delete require.cache[ledgerPath];
const {getWork,putWorkIfAbsent}=require('../api/_work-ledger');
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
