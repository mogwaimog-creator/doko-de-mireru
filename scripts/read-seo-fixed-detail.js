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
 if(Object.hasOwn(fixed,'watch/providers')||Object.hasOwn(fixed,'streaming')||
    Object.hasOwn(fixed,'rental')||Object.hasOwn(fixed,'purchase')||
    Object.hasOwn(fixed,'free'))return null;
 return fixed;
}
if(typeof module!=='undefined'&&module.exports)module.exports={readFixedDetail};
if(typeof window!=='undefined')window.dokoReadFixedDetail=readFixedDetail;
