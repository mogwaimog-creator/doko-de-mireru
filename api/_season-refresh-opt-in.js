'use strict';
// Fail-closed opt-in: both independent flags must be explicitly enabled.
// No Redis operation occurs on import or while either flag is disabled.
function seasonRefreshEnabled(env=process.env){
 return env?.SEASON_LEDGER_REFRESH_ENABLED==='1'&&env?.LEDGER_WRITES_RESUME==='1';
}
function optionalSeasonRefreshRecord(env=process.env,command){
 if(!seasonRefreshEnabled(env))return undefined;
 const {createSeasonRefreshWriter}=require('./_season-refresh-writer');
 return createSeasonRefreshWriter(command||((args)=>require('./_redis').command(args)));
}
module.exports={seasonRefreshEnabled,optionalSeasonRefreshRecord};
