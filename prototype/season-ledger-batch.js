'use strict';
// Offline staging for large TV series. All persistence functions are injected.
// Stages are isolated from the published snapshot until the full set is verified.
function createSeasonBatch({loadStage,saveStage,clearStage,fetchSeason,commit,maxPerRun=5}){
 if(![loadStage,saveStage,clearStage,fetchSeason,commit].every(x=>typeof x==='function'))throw Error('missing dependency');
 if(!Number.isSafeInteger(maxPerRun)||maxPerRun<1)throw Error('invalid limit');
 return async function run({tvId,seasonNumbers,revision,baseRecord=null}){
  if(!Number.isSafeInteger(tvId)||tvId<1||!Array.isArray(seasonNumbers)||!seasonNumbers.length||typeof revision!=='string'||!revision)throw Error('invalid batch');
  const unique=[...new Set(seasonNumbers)];
  if(unique.length!==seasonNumbers.length||unique.some(n=>!Number.isSafeInteger(n)||n<0))throw Error('invalid season numbers');
  const current=await loadStage(tvId);
  const stage=current?.revision===revision&&current?.tvId===tvId?current:{tvId,revision,completed:{}};
  const completed={...stage.completed};
  // Never accept staged numbers outside the current manifest.
  for(const key of Object.keys(completed))if(!unique.includes(Number(key)))delete completed[key];
  let fetched=0;
  try{
   for(const n of unique){
    if(Object.hasOwn(completed,n))continue;
    if(fetched>=maxPerRun)break;
    const detail=await fetchSeason(tvId,n);
    if(!detail||!Array.isArray(detail.episodes))throw Error('invalid season response');
    completed[n]=detail;
    fetched++;
    // Checkpoint each completed season so a later fetch failure does not lose progress.
    await saveStage(tvId,{tvId,revision,completed});
   }
   const remaining=unique.filter(n=>!Object.hasOwn(completed,n));
   if(remaining.length)return {status:'pending',remaining:remaining.length,fetched,record:baseRecord};
   // commit must verify the manifest, lock ownership and latest record before publication.
   const result=await commit({tvId,revision,completed,baseRecord});
   if(result!==true)throw Error('commit rejected');
   await clearStage(tvId,revision);
   return {status:'complete',remaining:0,fetched};
  }catch(error){
   return {status:'failed',fetched,record:baseRecord,error:String(error.message)};
  }
 };
}
module.exports={createSeasonBatch};
