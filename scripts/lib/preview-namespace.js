'use strict';
// Optional unique local fixture namespace. Does not alter live service adapters.
function key(value){const scope=process.env.SHARED_LEDGER_PREVIEW_SCOPE;if(!scope)return value;if(!/^[a-z0-9-]{1,60}$/.test(scope))throw Error('bounded preview scope required');return typeof value==='string'?value.replace(/^doko:dev:/,'doko:dev:preview:'+scope+':'):value}
module.exports={key,mapArgs:args=>args.map(key)};
