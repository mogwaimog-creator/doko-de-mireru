'use strict';
// Local fixture bridge only; no credential/provider access.
async function refresh(request){
 if(process.env.DEV_CONTENT_REFRESH_ENABLED!=='1'||!require('./_dev-content-ledgers').enabled())return null;
 const url=new URL(process.env.SHARED_LEDGER_DEV_URL||'http://127.0.0.1:16380');if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw Error('local content refresh required');url.pathname='/content-refresh';url.search='';url.hash='';
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('isolated content refresh unavailable');return response.json();
}
module.exports={refresh};
