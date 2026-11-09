'use strict';
// Shares the content control record; edits never resume a paused runtime.
const APPLY="local old=redis.call('GET',KEYS[1]);if (ARGV[1]=='!missing' and old) or (ARGV[1]~='!missing' and old~=ARGV[1]) then return false end;redis.call('MSET',KEYS[1],ARGV[2],KEYS[2],ARGV[3]);redis.call('EXPIRE',KEYS[2],1209600);return ARGV[2]";
function operations(command,{controlKey='doko:dev:content-control:v1',prefix='doko:dev:acquisition:v1:',clock=Date.now}={}){
 if(!/^doko:dev:[a-z0-9:-]+$/.test(controlKey)||!/^doko:dev:[a-z0-9:-]+:$/.test(prefix))throw Error('development acquisition keys required');
 return {async status(){const day=new Date(clock()+9*3600000).toISOString().slice(0,10),values=await command(['MGET',prefix+'attempts:'+day,prefix+'reserved-bytes']);return {dayJst:day,attempts:Number(values[0]||0),accountedBytes:Number(values[1]||0),capacityBytes:20971520,scope:'new fixed-work acquisition only; not total Redis storage or all TMDB requests'}},async set({revision,dailyLimit,paused,reason}={}){
 if(process.env.NODE_ENV==='production'||process.env.VERCEL_ENV==='production'||!Number.isSafeInteger(revision)||revision<0||!Number.isSafeInteger(dailyLimit)||dailyLimit<0||dailyLimit>10000||typeof paused!=='boolean'||typeof reason!=='string'||!reason.trim()||reason.length>300)throw Error('reviewed bounded acquisition policy required');
 const before=await command(['GET',controlKey]);if(before!==null&&Buffer.byteLength(before)>16384)throw Error('control record requires review');const prior=before===null?{status:'ready',revision:0}:JSON.parse(before);if((prior.revision||0)!==revision)throw Error('stale acquisition policy; inspect before retry');const at=new Date(clock()).toISOString(),next={...prior,newWorkDailyLimit:dailyLimit,newWorkAcquisitionPaused:paused,revision:revision+1,acquisitionPolicyUpdatedAt:at,acquisitionPolicyReason:reason};
 const raw=await command(['EVAL',APPLY,'2',controlKey,controlKey+':acquisition-audit:'+String(next.revision%20),before===null?'!missing':before,JSON.stringify(next),JSON.stringify({dailyLimit,paused,reason,at})]);if(raw===null||raw===false)throw Error('stale acquisition policy; inspect before retry');return {saved:true,control:JSON.parse(raw)};
 }};
}
module.exports={operations,APPLY};
