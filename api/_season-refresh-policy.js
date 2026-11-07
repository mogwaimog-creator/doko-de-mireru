'use strict';
// Pure proposed season refresh scheduling; no network or storage operations.
const DAY=86400000;
function seasonRefreshDue({checkedAt,status='unknown',now=Date.now()}={}){
 if(!Number.isFinite(now))throw Error('Invalid current time');
 const interval=status==='completed'?90*DAY:7*DAY;
 if(!checkedAt)return true;
 const checked=Date.parse(checkedAt);
 if(!Number.isFinite(checked)||checked>now+60000)return true;
 return now-checked>=interval;
}
module.exports={DAY,seasonRefreshDue};
