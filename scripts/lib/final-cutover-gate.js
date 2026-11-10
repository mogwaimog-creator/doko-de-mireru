'use strict';
// Offline release review only. This never changes environment, traffic, data or billing.
const HOUR=3600000;
function evaluate(evidence,{now=Date.now()}={}){
 const blockers=[],requireTrue=(name,value)=>{if(value!==true)blockers.push(name)},fresh=(name,value)=>{const at=Date.parse(value);if(!Number.isFinite(at)||at>now+60000||now-at>HOUR)blockers.push(name+':missing-or-stale')},finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const e=evidence||{},u=e.upstash||{},v=e.vercel||{},p=e.plan||{};
 fresh('upstash-usage',u.observedAt);fresh('vercel-usage',v.observedAt);
 requireTrue('upstash-free-plan',u.freePlanConfirmed);requireTrue('upstash-auto-upgrade-disabled',u.autoUpgradeDisabled);requireTrue('billing-hard-stop-confirmed',e.billingHardStopConfirmed);
 for(const [name,used,limit,extra] of [['commands',u.usedCommands,u.commandLimit,p.commands],['storage',u.usedBytes,u.byteLimit,p.additionalBytes],['transfer',u.usedTransferBytes,u.transferLimit,p.transferBytes]]){
  if(![used,limit,extra].every(finite)||limit<=0)blockers.push(name+':unmeasured');else if(used+extra>limit*0.8)blockers.push(name+':20-percent-headroom-required');
 }
 if(![v.remainingCreditUSD,p.vercelCostUSD].every(finite))blockers.push('vercel-cost:unmeasured');else if(v.remainingCreditUSD-p.vercelCostUSD<2)blockers.push('vercel-cost:2-USD-reserve-required');
 for(const name of ['sameRegisteredNamespaceVerified','all266StoredWithoutRefetch','manualFieldsReviewed','static13Preserved','allEntryPointsVerified','refreshAndFailurePolicyVerified','rollbackRehearsed','productionConfigurationReviewed','legacyWritersStoppedAndDrained','explicitProductionApproval'])requireTrue(name,e[name]);
 return {ready:blockers.length===0,blockers,authority:'review only; no deployment permission',operationsExecuted:0};
}
module.exports={evaluate};
