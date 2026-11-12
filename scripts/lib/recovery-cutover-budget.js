'use strict';
// Offline gate, no provider access. Values must come from the real account/export.
function evaluate(x){const required=['limitBytes','currentBytes','remainingCommands','remainingTransferBytes','backupKeys','scanCalls','backupExportBytes','restoreRequestBytes','seedBytes','indexBytes','operatingHeadroomBytes','otherMonthlyCommands','dailyUpdateOperations','monthlyReaderOperations','seedOperations','quotaDaysRemaining','monthlyOperatingTransferBytes','seedTransferBytes'];const reasons=[];for(const key of required)if(!Number.isFinite(x[key])||x[key]<0)reasons.push('未確認または不正: '+key);
 if(x.freePlanConfirmed!==true||x.noAutomaticBillingConfirmed!==true)reasons.push('無料契約・追加課金防止を確認できない');if(x.dedicatedDatabaseConfirmed!==true)reasons.push('他用途とDBを共用していないことを未確認');if(reasons.length)return {ready:false,reasons};
 const backupOperations=4*x.backupKeys+2*x.scanCalls,restoreRehearsalOperations=4*x.backupKeys,peakAfterResetBytes=x.seedBytes+x.indexBytes+x.operatingHeadroomBytes;
 const commandBudget=backupOperations+restoreRehearsalOperations+x.seedOperations+x.quotaDaysRemaining*x.dailyUpdateOperations+x.monthlyReaderOperations+x.otherMonthlyCommands,transferBudget=x.backupExportBytes+x.restoreRequestBytes+x.monthlyOperatingTransferBytes+x.seedTransferBytes;
 // Reserve one additional complete old restore and conservative 2x export transfer.
 const commandsWithRollback=commandBudget+4*x.backupKeys,transferWithRollback=transferBudget+x.restoreRequestBytes+x.backupExportBytes;
 if(peakAfterResetBytes>0.7*x.limitBytes)reasons.push('新方式の容量が上限70%を超える');if(commandsWithRollback>0.8*x.remainingCommands)reasons.push('復旧余力込みの操作数が残枠80%を超える');if(transferWithRollback>0.8*x.remainingTransferBytes)reasons.push('復旧余力込みの転送量が残枠80%を超える');if(x.currentBytes>x.limitBytes)reasons.push('現DBが契約上限を超える');
 return {ready:!reasons.length,reasons,backupOperations,restoreRehearsalOperations,peakAfterResetBytes,commandsWithRollback,transferWithRollback,notice:'Proposed development gate; all other traffic, Lua metering and exports must be included; never authorizes production execution'};
}
module.exports={evaluate};
