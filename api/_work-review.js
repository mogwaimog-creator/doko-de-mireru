'use strict';
// Independent, opt-in metadata verification status. Does not change the work ledger.
const {command}=require('./_redis');
const {identity}=require('./_work-ledger');
const crypto=require('node:crypto');
const PREFIX='doko:work-review:v1';
const INDEX='doko:work-review:index:v1';
function key(type,id){const w=identity(type,id);return PREFIX+':'+w.type+':'+w.id;}
function fingerprint(work){
  if(!work || !work.title)throw new Error('Work metadata required');
  const stable={type:work.type,id:work.id,title:work.title,releaseDate:work.releaseDate||null,posterPath:work.posterPath||null};
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
function parse(raw){if(!raw)return null;try{return typeof raw==='string'?JSON.parse(raw):raw;}catch{return null;}}
async function registerForReview(work,source='unspecified',now=new Date().toISOString()){
  const k=key(work.type,work.id),hash=fingerprint(work);
  const initial={type:work.type,id:Number(work.id),status:'unreviewed',fingerprint:hash,registeredAt:now,reviewedAt:null,reviewedBy:null,source};
  const created=await command(['SET',k,JSON.stringify(initial),'NX']);
  if(created==='OK'){
    await command(['ZADD',INDEX,Date.parse(now),k]);
    return {...initial,created:true};
  }
  const current=parse(await command(['GET',k]));
  if(!current)throw new Error('Review status unavailable; retry');
  // Repair an index write that failed after the initial SET NX.
  await command(['ZADD',INDEX,'NX',Date.parse(current.registeredAt||now),k]);
  if(current.fingerprint!==hash){
    const changed={...current,status:'needs_recheck',fingerprint:hash,changedAt:now,previousReviewAt:current.reviewedAt||null,reviewedAt:null,reviewedBy:null};
    // Compare-and-set protects a concurrent reviewer from being overwritten.
    const lua="local raw=redis.call('GET',KEYS[1]); if raw~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1";
    const ok=await command(['EVAL',lua,'1',k,JSON.stringify(current),JSON.stringify(changed)]);
    if(ok!==1)throw new Error('Review status changed concurrently; retry');
    return {...changed,created:false};
  }
  return {...current,created:false};
}
async function getReview(type,id){return parse(await command(['GET',key(type,id)]));}
async function markReviewed(work,reviewer,now=new Date().toISOString(),expectedFingerprint=null){
  if(typeof reviewer!=='string'||!reviewer.trim())throw new Error('Reviewer required');
  const k=key(work.type,work.id),current=await getReview(work.type,work.id);
  if(!current)throw new Error('Work not registered for review');
  if(current.fingerprint!==fingerprint(work) || (expectedFingerprint && current.fingerprint!==expectedFingerprint))throw new Error('Metadata changed; register updated work before review');
  const next={...current,status:'reviewed',reviewedAt:now,reviewedBy:reviewer.trim()};
  const auditKey='doko:work-review-history:v1:'+work.type+':'+work.id;
  const event=JSON.stringify({action:'reviewed',at:now,by:reviewer.trim(),from:current.status,to:'reviewed',fingerprint:current.fingerprint});
  const lua="local raw=redis.call('GET',KEYS[1]); if raw~=ARGV[1] then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); redis.call('LPUSH',KEYS[2],ARGV[3]); redis.call('LTRIM',KEYS[2],0,99); return 1";
  const ok=await command(['EVAL',lua,'2',k,auditKey,JSON.stringify(current),JSON.stringify(next),event]);
  if(ok!==1)throw new Error('Review status changed concurrently; retry');
  return next;
}
module.exports={key,fingerprint,registerForReview,getReview,markReviewed};
