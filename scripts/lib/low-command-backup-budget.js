'use strict';
// Actual command accounting: pipelines do not change the billable command count.
function compare({keys,scanCallsPerPass,nonStrings,stringGroups,preflightGroups,otherReservedCommands,remainingCommands=170000,reserveFraction=0.2}){
 for(const [k,v] of Object.entries({keys,scanCallsPerPass,nonStrings,stringGroups,preflightGroups,otherReservedCommands,remainingCommands}))if(!Number.isSafeInteger(v)||v<0)throw Error('measured or explicitly assumed integer required: '+k);
 const strings=keys-nonStrings;if(strings<0||stringGroups>strings||strings>0&&stringGroups<1||strings===0&&stringGroups!==0||preflightGroups<Math.ceil(keys/32)||preflightGroups>keys||!Number.isFinite(reserveFraction)||reserveFraction<0||reserveFraction>=1)throw Error('invalid coverage/grouping');
 const oldBackup=4*keys+2*scanCallsPerPass,oldRollback=4*keys,backup=2*keys+2*scanCallsPerPass+1,rollback=2*keys+nonStrings+stringGroups+preflightGroups+1;
 const allowance=Math.floor(remainingCommands*(1-reserveFraction));return {keyCount:keys,old:{backup:oldBackup,rollback:oldRollback,pair:oldBackup+oldRollback,total:oldBackup+oldRollback+otherReservedCommands},proposed:{backup,rollback,pair:backup+rollback,total:backup+rollback+otherReservedCommands},reduction:oldBackup+oldRollback-backup-rollback,allowance,margin:allowance-backup-rollback-otherReservedCommands,withinProposedBudget:backup+rollback+otherReservedCommands<=allowance,productionReady:false,notes:['TIME reserved once for backup and once for expired-key restore verification.','Full local restore/TYPE/value checks use no Upstash commands.','Functions/config inventory, actual scan/group counts, live traffic and account usage still require verification.']};
}
module.exports={compare};
