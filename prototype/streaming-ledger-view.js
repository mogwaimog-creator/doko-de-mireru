'use strict';
// Offline view adapter. Reading never triggers an API request.
const WAIT='配信情報を確認中です。しばらくしてからもう一度お試しください。';
function view(ledger,type,id,{updating=false,failed=false}={}){
 const record=ledger.get(type,id);
 const hasSaved=Boolean(record?.lastSuccessAt);
 if(hasSaved){
  const data=ledger.detail(type,id);
  return {state:failed?'stale-error':updating?'updating-cached':'cached',
   message:failed?'配信情報の更新に失敗しました。前回取得した情報を表示しています。':null,
   japan:data.japan,lastSuccessAt:data.lastSuccessAt,nextEligibleAt:data.nextEligibleAt,
   showRetry:failed};
 }
 return {state:failed?'unavailable':updating?'first-fetch':'not-fetched',
  message:failed?'配信情報を取得できませんでした。しばらくしてからもう一度お試しください。':WAIT,
  japan:null,lastSuccessAt:null,nextEligibleAt:null,showRetry:failed};
}
module.exports={view,WAIT};
