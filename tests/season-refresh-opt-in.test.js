'use strict';
const assert=require('node:assert/strict');
const {seasonRefreshEnabled,optionalSeasonRefreshRecord}=require('../api/_season-refresh-opt-in');
const cases=[
 [{},false],
 [{SEASON_LEDGER_REFRESH_ENABLED:'1'},false],
 [{LEDGER_WRITES_RESUME:'1'},false],
 [{SEASON_LEDGER_REFRESH_ENABLED:'0',LEDGER_WRITES_RESUME:'1'},false],
 [{SEASON_LEDGER_REFRESH_ENABLED:'1',LEDGER_WRITES_RESUME:'0'},false],
 [{SEASON_LEDGER_REFRESH_ENABLED:'1',LEDGER_WRITES_RESUME:'1'},true]
];
for(const [env,enabled] of cases){
 assert.equal(seasonRefreshEnabled(env),enabled);
 assert.equal(typeof optionalSeasonRefreshRecord(env,async()=>null)==='function',enabled);
}
const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'../api/search.js'),'utf8');
assert.match(source,/optionalSeasonRefreshRecord\(\)/);
assert.match(source,/refreshRecord \? \{ refreshRecord \} : \{\}/);
console.log('season refresh dual opt-in safety tests passed');
