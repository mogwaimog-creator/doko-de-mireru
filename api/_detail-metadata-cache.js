'use strict';
// Opt-in metadata cache for existing detail handlers. Streaming is never stored here.
const {getWork,putWorkIfAbsent}=require('./_work-ledger');
const {fromTmdb}=require('./_work-from-tmdb');
const {firstWorkLoad}=require('./_work-first-load');
const {createFrozenLoader,verified}=require('./_frozen-load');
const frozen=createFrozenLoader();

function fixedOnly(item){
  const {['watch/providers']:ignored,...metadata}=item;
  return metadata;
}
async function metadataWithLedger(type,id,load){
  if(require('./_recovery-fetch-cache').enabled())return require('./_recovery-fixed-work').readWork(type,Number(id),{load});
  if(process.env.DEV_CONTENT_LEDGER_ENABLED==='1'){const dev=require('./_dev-content-ledgers');if(dev.enabled())return dev.readWork(type,Number(id));}
  if(process.env.WORK_LEDGER_ENABLED!=='1')return verified(await load(),id,'work',type);
  try{
    const cached=await getWork(type,id);
    const detail=cached?.extensions?.tmdbDetail;
    if(detail && Number(detail.id)===Number(id))return detail;
    if(cached){const error=new Error('Existing work ledger is missing usable detail metadata; manual repair required');error.code='WORK_METADATA_INCOMPLETE';throw error;}
  }catch(e){if(e?.code==='WORK_METADATA_INCOMPLETE')throw e;console.error('WORK LEDGER READ FAILED',e);const busy=new Error('Metadata storage temporarily unavailable');busy.code='WORK_STORAGE_UNAVAILABLE';throw busy;}
  // Emergency storage freeze: existing work records remain readable; missing works load without saving.
  if(process.env.LEDGER_WRITES_RESUME!=='1')return frozen.run(type+':'+Number(id),async()=>fixedOnly(verified(await load(),id,'work',type)));
  return firstWorkLoad(type,id,async()=>{
  let already;
  try{already=await getWork(type,id);}
  catch(e){console.error('WORK LEDGER LOCKED READ FAILED',e);const busy=new Error('Metadata storage temporarily unavailable');busy.code='WORK_STORAGE_UNAVAILABLE';throw busy;}
  if(already?.extensions?.tmdbDetail && Number(already.extensions.tmdbDetail.id)===Number(id))return already.extensions.tmdbDetail;
  if(already){const error=new Error('Existing work ledger is missing usable detail metadata; manual repair required');error.code='WORK_METADATA_INCOMPLETE';throw error;}
  const original=await load();
  verified(original,id,'work',type);
  try{
    const fixed=fixedOnly(original);
    const saved=await putWorkIfAbsent(type,id,{
      ...fromTmdb(type,original),
      extensions:{tmdbDetail:fixed}
    });
    // Concurrent requests may have registered the canonical metadata first.
    // Return that shared record when available, without overwriting manual edits.
    if(saved?.extensions?.tmdbDetail && Number(saved.extensions.tmdbDetail.id)===Number(id)){
      const canonical=saved.extensions.tmdbDetail;
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
module.exports={metadataWithLedger,fixedOnly,_frozen:frozen};
