'use strict';
// Offline policy: series are updated only by daily 06:00 JST batch.
// Non-series are fetched on first visit, then only on visits >=24h after last success.
const DAY=86400000;
function time(v){const t=Date.parse(v);if(!Number.isFinite(t))throw Error('invalid time');return t}
function jstDay(at){return new Date(time(at)+9*3600000).toISOString().slice(0,10)}
function jstSixUtc(day){return Date.parse(day+'T06:00:00+09:00')}
function membershipSet(works){const ids=new Set();for(const w of works){if(!w||!['movie','tv'].includes(w.type)||!Number.isSafeInteger(Number(w.id))||Number(w.id)<1)continue;if((w.memberships||[]).some(m=>m?.kind==='watchOrder'))ids.add(w.type+':'+Number(w.id))}return ids}
function decision({type,id,lastSuccessAt,now,seriesKeys,trigger,lastSeriesRunDay}){
 const k=type+':'+Number(id),at=time(now);
 if(!['movie','tv'].includes(type)||!Number.isSafeInteger(Number(id))||Number(id)<1)throw Error('invalid identity');
 if(!['visit','cron'].includes(trigger))throw Error('invalid trigger');
 const series=seriesKeys.has(k);
 if(series){
  if(trigger!=='cron')return {fetch:false,reason:'series-uses-cron'};
  const day=jstDay(now);
  if(at<jstSixUtc(day))return {fetch:false,reason:'before-six-jst'};
  if(lastSeriesRunDay===day)return {fetch:false,reason:'already-processed-today'};
  return {fetch:true,reason:'series-six-jst',day};
 }
 if(trigger==='cron')return {fetch:false,reason:'non-series-visit-only'};
 if(!lastSuccessAt)return {fetch:true,reason:'first-visit'};
 return at-time(lastSuccessAt)>=DAY?{fetch:true,reason:'24h-visit'}:{fetch:false,reason:'cached'};
}
module.exports={membershipSet,decision,jstDay};
