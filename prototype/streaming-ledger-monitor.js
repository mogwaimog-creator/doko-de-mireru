'use strict';
// Read-only operational report from streaming service results.
// Does not modify records or issue any Redis commands.
const VALID=new Set(['updated','cached','series-uses-cron','already-processed-today','before-six-jst','non-series-visit-only','in-flight','deferred-budget','failed','writes-disabled','lease-expired','lease-expired-or-disabled','first-visit','24h-visit','series-six-jst']);
function summarize(results,works,{at=null}={}){
 if(!Array.isArray(results)||!Array.isArray(works))throw Error('invalid monitoring input');
 const seen=new Set(),entries=[],counts={updated:0,failed:0,deferred:0,locked:0,disabled:0,skipped:0,unknown:0};
 for(let i=0;i<results.length;i++){
  const r=results[i]||{},w=works[i]||{};
  const type=r.record?.type??w.type??null,id=r.record?.id??w.id??null;
  const key=['movie','tv'].includes(type)&&Number.isSafeInteger(Number(id))&&Number(id)>0?type+':'+Number(id):null;
  const reason=typeof r.reason==='string'?r.reason:'unknown';
  if(r.updated===true)counts.updated++;
  else if(reason==='failed')counts.failed++;
  else if(reason==='deferred-budget')counts.deferred++;
  else if(reason==='in-flight'||reason==='lease-expired'||reason==='lease-expired-or-disabled')counts.locked++;
  else if(reason==='writes-disabled')counts.disabled++;
  else if(VALID.has(reason))counts.skipped++;
  else counts.unknown++;
  if(key)seen.add(key);
  if(!r.updated&&['failed','deferred-budget','lease-expired','lease-expired-or-disabled','writes-disabled'].includes(reason)){
   entries.push({key,reason,previousSuccessAt:r.record?.lastSuccessAt??null,hasSavedData:!!r.record?.lastSuccessAt,error:reason==='failed'?String(r.error??'取得に失敗しました').slice(0,200):null});
  }
 }
 return {at,processed:results.length,uniqueWorks:seen.size,counts,needsAttention:entries,healthy:counts.failed===0&&counts.deferred===0&&counts.locked===0&&counts.unknown===0};
}
module.exports={summarize};
