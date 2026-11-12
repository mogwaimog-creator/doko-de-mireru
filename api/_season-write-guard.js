'use strict';
// Pure guard for season-ledger persistence. No Redis access.
// Default is frozen; only an explicit "1" allows writes.
function seasonWritesAllowed(env=process.env){
 return !!env && env.LEDGER_WRITES_RESUME==='1';
}
function assertSeasonWritesAllowed(env=process.env){
 if(!seasonWritesAllowed(env)){
  const error=new Error('Season ledger writes are frozen');
  error.code='SEASON_LEDGER_WRITES_FROZEN';
  throw error;
 }
}
module.exports={seasonWritesAllowed,assertSeasonWritesAllowed};
