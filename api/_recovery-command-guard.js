'use strict';
// Exact scripts and bounded development namespaces only, for the loopback preview.
function allowed(args){
 if(!Array.isArray(args))return false;
 const work=/^doko:dev:(?:work:v2:(?:movie|tv):[1-9][0-9]*|seo:v1:(?:movie|tv):[1-9][0-9]*|season:v1:tv:[1-9][0-9]*)(?::meta|:lease)?$/;
 if(['GET','MGET'].includes(args[0]))return args.length>1&&args.length<=33&&args.slice(1).every(k=>work.test(k)||/^doko:dev:legacy-work:v1:(movie|tv):[1-9][0-9]*$/.test(k));
 if(args[0]!=='EVAL')return false;
 const store=require('./_dev-content-store'),scripts=[store.COMMIT,store.CLAIM_LEASE,store.RELEASE_LEASE,require('./_new-work-ingest').RESERVE,require('./_new-work-ingest').SETTLE,require('./_recovery-initial-seo').PROJECT];
 const n=Number(args[2]);return scripts.includes(args[1])&&Number.isInteger(n)&&n>=1&&n<=32&&args.length>=3+n&&args.slice(3,3+n).every(k=>typeof k==='string'&&(work.test(k)||k==='doko:dev:content-control:v1'||/^doko:dev:acquisition:v1:(?:reserved-bytes|attempts:[0-9]{4}-[0-9]{2}-[0-9]{2})$/.test(k)||/^doko:dev:search:v2:(?:unused|doc:work:(?:movie|tv):[1-9][0-9]*|ids:work|grams:work)$/.test(k)));
}
module.exports={allowed};
