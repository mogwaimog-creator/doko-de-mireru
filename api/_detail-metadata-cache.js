'use strict';
// Opt-in metadata cache for existing detail handlers. Streaming is never stored here.
const {getWork,putWorkIfAbsent}=require('./_work-ledger');
const {fromTmdb}=require('./_work-from-tmdb');

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
  const original=await load();
  if(!original||Number(original.id)!==Number(id))return original;
  try{
    const fixed=fixedOnly(original);
    await putWorkIfAbsent(type,id,{
      ...fromTmdb(type,original),
      extensions:{tmdbDetail:fixed}
    });
  }catch(e){console.error('WORK LEDGER WRITE FAILED',e);}
  return original;
}
module.exports={metadataWithLedger,fixedOnly};
