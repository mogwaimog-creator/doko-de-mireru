'use strict';
// Default legacy behavior stays intact. A future release must not fall back silently.
function blocked(res,{mode=process.env.LEDGER_RELEASE_MODE}={}){if(mode===undefined||mode==='legacy')return false;res.setHeader('Cache-Control','private, no-store');res.setHeader('Vercel-CDN-Cache-Control','no-store');res.setHeader('Retry-After','30');res.status(503).json({error:'更新と保存を停止しています。',code:'RELEASE_ROUTE_NOT_ACTIVATED'});return true}
module.exports={blocked};
