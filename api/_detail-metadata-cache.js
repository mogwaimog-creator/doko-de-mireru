'use strict';
// Opt-in metadata cache for existing detail handlers. Streaming is never stored here.
const {getWork,putWorkIfAbsent}=require('./_work-ledger');
const {fromTmdb}=require('./_work-from-tmdb');
const {firstWorkLoad}=require('./_work-first-load');
const {workToLegacyDetail}=require('./_work-to-legacy-detail');

// Opt-in only after compact records and legacy rendering pass validation.
function readFixedDetail(record,type,id){
  if(!record)return null;
  const original=record.extensions?.tmdbDetail;
  if(original && Number(original.id)===Number(id))return original;
  if(process.env.COMPACT_WORK_READ_ENABLED!=='1')return null;
  if(record.type!==type || Number(record.id)!==Number(id))return null;
  return workToLegacyDetail(record);
}

function fixedOnly(item){
  const {['watch/providers']:ignored,...metadata}=item;
  return metadata;
}
async function metadataWithLedger(type,id,load){
  if(process.env.WORK_LEDGER_ENABLED!=='1')return load();
  try{
    const cached=await getWork(type,id);
    const detail=readFixedDetail(cached,type,id);
    if(detail && Number(detail.id)===Number(id))return detail;
    if(cached){const error=new Error('Existing work ledger is missing usable detail metadata; manual repair required');error.code='WORK_METADATA_INCOMPLETE';throw error;}
  }catch(e){if(e?.code==='WORK_METADATA_INCOMPLETE')throw e;console.error('WORK LEDGER READ FAILED',e);const busy=new Error('Metadata storage temporarily unavailable');busy.code='WORK_STORAGE_UNAVAILABLE';throw busy;}
  // Emergency storage freeze: existing work records remain readable; missing works load without saving.
  if(process.env.LEDGER_WRITES_RESUME!=='1')return load();
  return firstWorkLoad(type,id,async()=>{
  let already;
  try{already=await getWork(type,id);}
  catch(e){console.error('WORK LEDGER LOCKED READ FAILED',e);const busy=new Error('Metadata storage temporarily unavailable');busy.code='WORK_STORAGE_UNAVAILABLE';throw busy;}
  const alreadyDetail=readFixedDetail(already,type,id);
  if(alreadyDetail)return alreadyDetail;
  if(already){const error=new Error('Existing work ledger is missing usable detail metadata; manual repair required');error.code='WORK_METADATA_INCOMPLETE';throw error;}
  const original=await load();
  if(!original||Number(original.id)!==Number(id))return original;
  try{
    const fixed=fixedOnly(original);
    const saved=await putWorkIfAbsent(type,id,{
      ...fromTmdb(type,original),
      extensions:{tmdbDetail:fixed}
    });
    // Concurrent requests may have registered the canonical metadata first.
    // Return that shared record when available, without overwriting manual edits.
    const canonical=readFixedDetail(saved,type,id);
    if(canonical){
      if(original['watch/providers'] && !canonical['watch/providers']){
        return {...canonical,'watch/providers':original['watch/providers']};
      }
      return canonical;
    }
    const error=new Error('Existing work ledger is missing usable detail metadata; manual repair required');error.code='WORK_METADATA_INCOMPLETE';throw error;
  }catch(e){if(e?.code==='WORK_METADATA_INCOMPLETE')throw e;console.error('WORK LEDGER WRITE FAILED',e);const busy=new Error('Metadata storage temporarily unavailable');busy.code='WORK_STORAGE_UNAVAILABLE';throw busy;}
  return original;
  });
}
module.exports={metadataWithLedger,fixedOnly};
