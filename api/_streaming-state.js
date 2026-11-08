'use strict';
const DAY=86400000;
function stamp(value,now){const t=Date.parse(value);return Number.isFinite(t)&&t<=now+60000?t:null}
function legacyWatch(raw,now=Date.now()){
 try{const r=typeof raw==='string'?JSON.parse(raw):raw;if(!Array.isArray(r?.flatrate)||stamp(r.checkedAt,now)===null)return null;return {...r,stale:now-Date.parse(r.checkedAt)>=DAY,source:'legacy-watch'}}catch{return null}
}
function newer(...values){return values.filter(Boolean).reduce((best,r)=>!best||Date.parse(r.checkedAt)>Date.parse(best.checkedAt)?r:best,null)}
function selectWatch(shared,old,now=Date.now()){
 const valid=r=>r&&Array.isArray(r.flatrate)&&stamp(r.checkedAt,now)!==null?r:null;
 const chosen=newer(valid(shared),legacyWatch(old,now));
 if(!chosen)return null;
 return {flatrate:chosen.flatrate,checkedAt:chosen.checkedAt,stale:chosen.stale===true||now-Date.parse(chosen.checkedAt)>=DAY};
}
function detailState(shared,watchCopy,detailCopy,now=Date.now()){
 let oldDetail=null;try{oldDetail=typeof detailCopy==='string'?JSON.parse(detailCopy):detailCopy}catch{}
 const oldJP=oldDetail?.data?.results?.JP;
 const full=[];
 if(shared?.detail)full.push({jp:shared.detail.data.results.JP,checkedAt:shared.detail.checkedAt,source:'shared',stale:shared.watch?.stale});
 if(oldDetail?.data?.results&&typeof oldDetail.data.results==='object'&&!Array.isArray(oldDetail.data.results)&&oldJP&&typeof oldJP==='object'&&!Array.isArray(oldJP)&&['flatrate','rent','buy'].every(k=>oldJP[k]===undefined||Array.isArray(oldJP[k]))&&stamp(oldDetail.checkedAt,now)!==null)full.push({jp:oldJP,checkedAt:oldDetail.checkedAt,source:'legacy-detail'});
 const watches=full.filter(r=>Array.isArray(r.jp.flatrate)).map(r=>({...r,flatrate:r.jp.flatrate}));
 if(shared?.watch)watches.unshift({...shared.watch,source:'shared'});
 watches.push(legacyWatch(watchCopy,now));
 const watch=newer(...watches);
 const jp={},categoryCheckedAt={flatrate:null,rent:null,buy:null};
 if(watch){jp.flatrate=watch.flatrate;categoryCheckedAt.flatrate=watch.checkedAt}
 for(const kind of ['rent','buy']){const saved=newer(...full.filter(r=>Array.isArray(r.jp[kind])));if(saved){jp[kind]=saved.jp[kind];categoryCheckedAt[kind]=saved.checkedAt}}
 const times=Object.values(categoryCheckedAt).filter(Boolean),coverage=Object.keys(categoryCheckedAt).filter(k=>categoryCheckedAt[k]);
 const latest=times.length?times.reduce((a,b)=>Date.parse(a)>=Date.parse(b)?a:b):null;
 const failed=shared?.attempt?.failed&&(!latest||Date.parse(shared.attempt.at)>Date.parse(latest));
 const stale=times.length>0&&(watch?.stale===true||times.some(t=>now-Date.parse(t)>=DAY)||failed);
 return {data:{results:times.length?{JP:jp}:{}},stale,meta:{status:times.length?(stale?'stale':'fresh'):(failed?'failed':'unknown'),lastSuccessAt:latest,source:watch?.source||newer(...full)?.source||null,coverage,categoryCheckedAt,refreshFailed:!!failed,flatrateEmpty:!!watch&&watch.flatrate.length===0}};
}
module.exports={stamp,legacyWatch,newer,selectWatch,detailState};
