'use strict';
// Offline policy: series are updated only by daily 06:00 JST batch.
// Non-series are fetched on first visit, then only on visits >=24h after last success.

function time(v){const t=Date.parse(v);if(!Number.isFinite(t))throw Error('invalid time');return t}
function jstDay(at){return new Date(time(at)+9*3600000).toISOString().slice(0,10)}
function jstSixUtc(day){return Date.parse(day+'T06:00:00+09:00')}
function membershipSet(works){const ids=new Set();for(const w of works){if(!w||!['movie','tv'].includes(w.type)||!Number.isSafeInteger(Number(w.id))||Number(w.id)<1)continue;if((w.memberships||[]).some(m=>m?.kind==='watchOrder'))ids.add(w.type+':'+Number(w.id))}return ids}
function decision({type,id,lastSuccessAt,now,seriesKeys,trigger,lastSeriesRunDay,lastAttemptAt,errors}){
 const k=type+':'+Number(id),at=time(now);
 if(!['movie','tv'].includes(type)||!Number.isSafeInteger(Number(id))||Number(id)<1)throw Error('invalid identity');
 if(!['visit','cron'].includes(trigger))throw Error('invalid trigger');
 const result=require('./streaming-update-schedule').decide({lastSuccessAt,lastAttemptAt,lastSeriesRunDay,errors},{at:now,watchOrder:seriesKeys.has(k),scheduled:trigger==='cron'});
 if(!seriesKeys.has(k)&&trigger==='cron')return {fetch:false,reason:'non-series-visit-only'};
 const reasons={'scheduled-only':'series-uses-cron','before-06-jst':'before-six-jst','already-attempted-today':'already-processed-today','daily-06-jst':'series-six-jst','retry-cooldown':'failure-cooldown','fresh':'cached','never-succeeded':'first-visit','24h-after-success':'24h-visit'};
 return {fetch:result.due,reason:reasons[result.reason],...(result.runDay?{day:result.runDay}:{})};
}
module.exports={membershipSet,decision,jstDay};
