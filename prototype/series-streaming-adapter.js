'use strict';
// Converts the shared Japan streaming ledger into the legacy detail-card provider shape.
// Read-only: no API calls, refreshes, or mutations.
function seriesStreamingProviders(ledger,type,id){
 if(!ledger||typeof ledger.detail!=='function')throw Error('missing streaming ledger');
 const record=ledger.detail(type,id);
 if(!record||!record.lastSuccessAt)return null; // Unknown is not the same as no streaming.
 const providers=record.japan?.flatrate;
 if(!Array.isArray(providers))return null;
 const seen=new Set(),out=[];
 for(const p of providers){
  const n=Number(p?.providerId);
  if(!Number.isSafeInteger(n)||n<1||seen.has(n))continue;
  seen.add(n);
  out.push({provider_id:n,provider_name:String(p.name??''),logo_path:typeof p.logoPath==='string'?p.logoPath:null});
 }
 return out;
}
module.exports={seriesStreamingProviders};
