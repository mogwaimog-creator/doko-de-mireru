'use strict';
// Explicit review of already-fetched metadata; never runs during ordinary page views.
// Does not overwrite the canonical work, and never requests TMDB on its own.
const {getWork}=require('./_work-ledger');
const {fromTmdb}=require('./_work-from-tmdb');
const {recordAnomaly}=require('./_work-anomalies');
async function inspectExistingWork(type,id,observed,context={}){
 if(!observed || Number(observed.id)!==Number(id))throw new Error('Observed TMDB ID mismatch');
 const existing=await getWork(type,id);
 if(!existing)return {status:'not_registered',recorded:false};
 const normalized=fromTmdb(type,observed);
 const result=await recordAnomaly(type,id,existing,normalized,context);
 return {status:result.changes.length?'needs_review':'unchanged',...result};
}
module.exports={inspectExistingWork};
