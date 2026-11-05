'use strict';
// Offline-only boundary for precomputed, display-ready fixed details.
// Input must be the EXISTING normalized /api/search detail response, not raw TMDB.
// No Redis, TMDB, network, or deployment side effects.
const {splitDetailResponse,mergeDetailResponse}=require('./seo-detail-response-contract');

function normalizeFixedDisplayRecord(type,id,detail){
  if(!['movie','tv'].includes(type))throw Error('Invalid media type');
  const numericId=Number(id);
  if(!Number.isSafeInteger(numericId)||numericId<=0||String(id)!==String(numericId))throw Error('Invalid work identity');
  if(!detail||typeof detail!=='object'||Array.isArray(detail)||Number(detail.id)!==numericId)
    throw Error('Normalized detail identity mismatch');
  const {fixed,dynamic}=splitDetailResponse(detail);
  // A fixed record must be based on a fully assembled display response.
  // Never silently substitute raw tmdbDetail or empty provider arrays.
  if(typeof fixed.title!=='string'||!fixed.title.trim())throw Error('Missing display title');
  if(Object.keys(fixed).length<3)throw Error('Incomplete normalized display detail');
  if(JSON.stringify(mergeDetailResponse(fixed,dynamic))!==JSON.stringify(detail))
    throw Error('Display response round-trip mismatch');
  return {schemaVersion:1,type,id:numericId,fixed};
}

function validateFixedDisplayRecord(record,type,id){
  if(!record||record.schemaVersion!==1||record.type!==type||
     record.id!==Number(id)||!record.fixed||record.fixed.id!==Number(id)||
     typeof record.fixed.title!=='string'||!record.fixed.title.trim())
    throw Error('Invalid precomputed fixed detail');
  const {DYNAMIC_FIELDS}=require('./seo-detail-response-contract');
  if(DYNAMIC_FIELDS.some(key=>Object.hasOwn(record.fixed,key)))
    throw Error('Provider data in precomputed fixed detail');
  return record.fixed;
}
module.exports={normalizeFixedDisplayRecord,validateFixedDisplayRecord};
