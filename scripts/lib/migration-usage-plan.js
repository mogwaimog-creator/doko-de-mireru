'use strict';
// Pure accounting only. Never imports Redis/Vercel adapters or credentials.
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const integer=x=>finite(x)&&Number.isSafeInteger(x);
function check(object,names,int=false){for(const key of names)if(!(int?integer:finite)(object[key]))throw Error('missing/invalid measured value: '+key)}
function date(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s)||new Date(s).toISOString().slice(0,10)!==s)throw Error('invalid date');return Date.parse(s)}
function summarize(input){
 const u=input.upstash,v=input.vercel;
 check(u,['storageUsedMB','storageLimitMB','commandsUsed','commandsLimit','bandwidthUsedGB','bandwidthLimitGB']);
 check(v,['usedUSD','creditUSD','buildCPUHours','buildUSD','functionInvocations','invocationsUSD','activeCPUMinutes','activeCPUUSD','memoryGBHours','memoryUSD','originTransferMB','originUSD','observabilityEvents','observabilityUSD']);
 const days=(date(v.periodEnd)-date(v.periodStart))/86400000,elapsed=(date(input.calculationDate)-date(v.periodStart))/86400000;if(days<=0||elapsed<=0||elapsed>=days)throw Error('snapshot must be inside billing period');const remaining=days-elapsed;
 if(u.commandsUsed>u.commandsLimit||u.bandwidthUsedGB>u.bandwidthLimitGB||u.storageUsedMB>u.storageLimitMB||v.usedUSD>v.creditUSD)throw Error('reported usage already exceeds budget');
 for(const name of ['buildCPUHours','functionInvocations','activeCPUMinutes','memoryGBHours','originTransferMB','observabilityEvents'])if(v[name]<=0)throw Error('cannot derive rate from zero usage: '+name);
 const nonBuildUSD=v.usedUSD-v.buildUSD,listed=v.buildUSD+v.invocationsUSD+v.activeCPUUSD+v.memoryUSD+v.originUSD+v.observabilityUSD;
 if(nonBuildUSD<0||listed>v.usedUSD+0.01)throw Error('inconsistent displayed costs');
 return {upstash:{remainingCommands:u.commandsLimit-u.commandsUsed,remainingTransferBytes:(u.bandwidthLimitGB-u.bandwidthUsedGB)*1e9,storageHeadroomBytes:(u.storageLimitMB-u.storageUsedMB)*1e6,storageUtilization:u.storageUsedMB/u.storageLimitMB},vercel:{remainingCreditUSD:v.creditUSD-v.usedUSD,buildShare:v.buildUSD/v.usedUSD,nonBuildUSD,unitemizedUSD:v.usedUSD-listed,periodDays:days,elapsedDays:elapsed,remainingDays:remaining,projectedTotalAtSamePaceUSD:v.usedUSD*days/elapsed,projectedRemainingNonBuildUSD:nonBuildUSD*remaining/elapsed,creditForAdditionalWorkAfterBaselineUSD:v.creditUSD-v.usedUSD-nonBuildUSD*remaining/elapsed},rates:{buildCPUPerMinute:v.buildUSD/(v.buildCPUHours*60),invocation:v.invocationsUSD/v.functionInvocations,activeCPUPerMinute:v.activeCPUUSD/v.activeCPUMinutes,memoryGBHour:v.memoryUSD/v.memoryGBHours,originMB:v.originUSD/v.originTransferMB,event:v.observabilityUSD/v.observabilityEvents},notice:'Rates are ratios of rounded observed amounts, not verified contractual marginal prices. Linear projections assume snapshot date and unchanged scope.'};
}
function redisPlan(input,p){
 const s=summarize(input);const required=['keyCount','scanCallsPerPass','seedRecords','upstashDaysRemaining','otherRemainingCommands','seoHTMLRequests','seoColdRequests','dailyUpdateOperations','validationOperations','compatibilityOperations','controlOperations','resetAndRollbackClearOperations'];
 const missing=required.filter(k=>!integer(p[k]));if(typeof p.seoAdmissionTracking!=='boolean')missing.push('seoAdmissionTracking');if(missing.length)return {withinProposedBudget:false,missing,productionReady:false};
 if(p.seoColdRequests>p.seoHTMLRequests)throw Error('cold requests exceed total HTML requests');
 const batches=Math.ceil(p.seedRecords/32),backup=4*p.keyCount+2*p.scanCallsPerPass,localRestore=4*p.keyCount,rollback=4*p.keyCount,seed=5*batches;
 const html=(p.seoAdmissionTracking?8:3)*p.seoHTMLRequests+15*p.seoColdRequests;
 // The 3/8/15 coefficients model warm general cached work, not every possible route.
 const other=p.otherRemainingCommands+p.validationOperations+p.compatibilityOperations+p.controlOperations+p.resetAndRollbackClearOperations;
 const operations=backup+rollback+seed+p.dailyUpdateOperations*p.upstashDaysRemaining+html+other;
 const allowed=Math.floor(s.upstash.remainingCommands*0.8),migrationRPCs=p.keyCount+2*p.scanCallsPerPass+4*p.keyCount+3*batches;
 const transferFields=['backupDownloadBytes','rollbackUploadBytes','rollbackVerificationDownloadBytes','seedWireBytes','validationWireBytes','otherRemainingTransferBytes','dailyUpdateWireBytes'];const absent=transferFields.filter(k=>!finite(p[k]));if(!finite(p.transferOverheadFactor)||p.transferOverheadFactor<1)absent.push('transferOverheadFactor');
 const payloadTransfer=absent.length?null:p.backupDownloadBytes+p.rollbackUploadBytes+p.rollbackVerificationDownloadBytes+p.seedWireBytes+p.validationWireBytes+p.otherRemainingTransferBytes+p.dailyUpdateWireBytes*p.upstashDaysRemaining;const transfer=payloadTransfer===null?null:payloadTransfer*p.transferOverheadFactor;
 return {productionReady:false,backupOperations:backup,localRestoreOperations:localRestore,localRestoreUpstashOperations:0,rollbackReserveOperations:rollback,seedOperations:seed,batches,seedRPCs:3*batches,migrationRPCsExcludingUnknownValidation:migrationRPCs,seoHTMLOperations:html,allReservedOperations:operations,commandAllowance:allowed,commandMargin:allowed-operations,payloadTransferBytes:payloadTransfer,transferBytes:transfer,transferAllowance:s.upstash.remainingTransferBytes*0.8,transferMargin:transfer===null?null:s.upstash.remainingTransferBytes*0.8-transfer,missing:absent,withinProposedBudget:operations<=allowed&&transfer!==null&&transfer<=s.upstash.remainingTransferBytes*0.8,notice:'Scenario only. Includes one old-data rollback; full restore rehearsal stays local. No extra complete backup/retry is included. Upstash metering, reset implementation and request overhead require verification.'};
}
function seoRuntime(input,p){
 check(p,['htmlRequests','cpuMsPerHTML','memoryGB','wallMsPerHTML','htmlBytes','eventsPerHTML']);const rates=summarize(input).rates,h=p.htmlRequests;
 const usage={additionalInvocations:h,additionalActiveCPUMinutes:h*p.cpuMsPerHTML/60000,additionalMemoryGBHours:h*p.memoryGB*p.wallMsPerHTML/3600000,additionalOriginMB:h*p.htmlBytes/1e6,additionalEvents:h*p.eventsPerHTML};
 const cost={invocationsUSD:usage.additionalInvocations*rates.invocation,activeCPUUSD:usage.additionalActiveCPUMinutes*rates.activeCPUPerMinute,memoryUSD:usage.additionalMemoryGBHours*rates.memoryGBHour,originUSD:usage.additionalOriginMB*rates.originMB,observabilityUSD:usage.additionalEvents*rates.event};return {usage,cost,totalUSD:Object.values(cost).reduce((a,b)=>a+b,0),additionalBuildCPUForPageViews:0,notice:'Hypothetical incremental runtime; assumes all dynamic HTML bytes billed as Origin Transfer. Compression, caching, regional pricing and event attribution unverified.'};
}
function vercelPlan(input,p){
 const s=summarize(input);if(!integer(p.builds)||!finite(p.cpuMinutesPerBuild)||!finite(p.reserveUSD)||!p.seo)return {withinProposedBudget:false,productionReady:false,reason:'build count, per-build CPU and traffic assumptions required'};
 const runtime=seoRuntime(input,p.seo),buildUSD=p.builds*p.cpuMinutesPerBuild*s.rates.buildCPUPerMinute,projected=input.vercel.usedUSD+s.vercel.projectedRemainingNonBuildUSD+runtime.totalUSD+buildUSD;
 return {productionReady:false,builds:p.builds,cpuMinutes:p.builds*p.cpuMinutesPerBuild,buildUSD,seoRuntime:runtime,projectedPeriodTotalUSD:projected,creditMarginUSD:input.vercel.creditUSD-projected,reserveUSD:p.reserveUSD,withinProposedBudget:projected+p.reserveUSD<=input.vercel.creditUSD,notice:'No additional builds outside this plan assumed; snapshot scope/elapsed days and real per-deployment CPU must be verified.'};
}
function releaseGate(evidence){const required=['freePlanConfirmed','overageBehaviorVerified','usageScopeVerified','meteringTopologyVerified','databaseDedicated','quotasRefreshed','upstashResetDateKnown','keyCountMeasured','backupWireBytesMeasured','luaBillingVerified','providerRestoreVerified','writersCovered','pcBackupRestoreVerified','seedBytesMeasured','periodTrafficBudgeted','buildCPUPerReleaseMeasured','existingBuildActivityBudgeted','productionAdapterVerified'];const missing=required.filter(key=>evidence[key]!==true);return {ready:missing.length===0&&evidence.redisWithinBudget===true&&evidence.vercelWithinBudget===true,missing,...(evidence.redisWithinBudget!==true?{redis:'budget not verified'}:{}),...(evidence.vercelWithinBudget!==true?{vercel:'budget not verified'}:{}),authorization:'Never authorizes reset, deploy or billing changes'};}
function buildPlan(p){
 const missing=['productionAdapterVerified','environmentFinalized','stagedChecksSafe','legacyWriterStopVerified'].filter(k=>p[k]!==true);
 const builds=p.strategy==='preview-promotion'?2:p.strategy==='staged-production'?(p.sameArtifactModesVerified===true?1:2):null;
 return {plannedBuilds:builds,targetBuilds:1,ready:missing.length===0&&builds!==null,missing,mode:p.sameArtifactModesVerified===true?'single-artifact legacy/paused/new modes verified':'bridge release may be needed; budget two builds',authorization:'Plan only. No deployment, promotion, environment or billing mutation is performed.'};
}
module.exports={summarize,redisPlan,seoRuntime,vercelPlan,releaseGate,buildPlan};
