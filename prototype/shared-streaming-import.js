'use strict';
// Pure migration plan. Reject unverified IDs; keep partial historical coverage explicit.
const {store,key}=require('./streaming-ledger');
function planComparisonSnapshot(data){
 const records=[],rejected=[];
 if(!data?.snapshot||!/^\d{4}-\d{2}-\d{2}$/.test(data.checkedAt))throw Error('invalid snapshot');
 const at=data.checkedAt+'T00:00:00.000Z';
 for(const [identity,snapshot] of Object.entries(data.snapshot)){
  try{
   const [type,id,...extra]=identity.split(':');if(extra.length||key(type,id)!==identity||!Array.isArray(snapshot.streaming))throw Error('unverified identity or unavailable streaming');
   const ledger=store();ledger.register(type,id);ledger.success(type,id,{JP:{flatrate:snapshot.streaming}},at);
   records.push({...ledger.get(type,id),coverage:['flatrate'],source:{kind:'embedded-comparison',datePrecision:'day',date:data.checkedAt},schemaVersion:1,revision:0});
  }catch(e){rejected.push({identity,reason:e.message})}
 }
 return {records,rejected};
}
module.exports={planComparisonSnapshot};
