'use strict';
// Opt-in metadata cache for existing detail handlers. Streaming is never stored here.
const {getWork,putWorkIfAbsent}=require('./_work-ledger');
const {fromTmdb}=require('./_work-from-tmdb');
const {firstWorkLoad}=require('./_work-first-load');

function fixedOnly(item){
  const {['watch/providers']:ignored,...metadata}=item;
  return metadata;
}
async function metadataWithLedger(type,id,load){
  if(process.env.WORK_LEDGER_ENABLED!=='1')return load();
  try{
    const cached=await getWork(type,id);
    const detail=cached?.extensions?.tmdbDetail;
    if(detail && Number(detail.id)===Number(id))return detail;
  }catch(e){console.error('WORK LEDGER READ FAILED',e);}
  return firstWorkLoad(type,id,async()=>{
  const already=await getWork(type,id).catch(()=>null);
  if(already?.extensions?.tmdbDetail)return already.extensions.tmdbDetail;
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
    if(saved?.extensions?.tmdbDetail && Number(saved.extensions.tmdbDetail.id)===Number(id)){
      const canonical=saved.extensions.tmdbDetail;
      if(original['watch/providers'] && !canonical['watch/providers']){
        return {...canonical,'watch/providers':original['watch/providers']};
      }
      return canonical;
    }
  }catch(e){console.error('WORK LEDGER WRITE FAILED',e);}
  return original;
  });
}
module.exports={metadataWithLedger,fixedOnly};
