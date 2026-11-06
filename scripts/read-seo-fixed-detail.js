'use strict';
// Browser-compatible, read-only parser. Does not trigger API calls.
function readFixedDetail(doc,expectedType,expectedId){
 if(!['movie','tv'].includes(expectedType))return null;
 const id=Number(expectedId);
 if(!Number.isSafeInteger(id)||id<=0)return null;
 const el=doc?.getElementById?.('doko-fixed-detail');
 if(!el||el.getAttribute('type')!=='application/json')return null;
 let payload;
 try{payload=JSON.parse(el.textContent||'');}catch{return null;}
 if(!payload||payload.type!==expectedType||payload.id!==id)return null;
 const fixed=payload.metadata;
 if(!fixed||typeof fixed!=='object'||Array.isArray(fixed)||Number(fixed.id)!==id)return null;
 const dynamicKeys=['streaming','rental','purchase','netflix','amazon','fod','google_play',
   'netflix_url','amazon_url','unext_url','hulu_url','disney_url','apple_url',
   'apple_tv_url','fod_url','google_play_url','watch/providers','free'];
 if(dynamicKeys.some(key=>Object.hasOwn(fixed,key)))return null;
 return fixed;
}
if(typeof module!=='undefined'&&module.exports)module.exports={readFixedDetail};
if(typeof window!=='undefined')window.dokoReadFixedDetail=readFixedDetail;
