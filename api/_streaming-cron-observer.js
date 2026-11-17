'use strict';
const {observer}=require('./_streaming-cron-observer-core');
const SAFE_FIELDS=new Set(['stage','event','at','elapsedMs','code','status','succeeded','failed','pending']);
function diagnosticLine(event){const clean={};for(const [key,value] of Object.entries(event))if(SAFE_FIELDS.has(key)&&(['string','number'].includes(typeof value)||value===null))clean[key]=value;return JSON.stringify(clean)}
function wrapScheduler(scheduler,{clock=Date.now,log=console.info}={}){
 if(!scheduler||typeof scheduler.run!=='function'||typeof log!=='function')throw Error('scheduler required');
 const observe=observer({clock,emit:event=>log('STREAMING_CRON_DIAGNOSTIC',diagnosticLine(event))});
 return {...scheduler,run(...args){return observe(()=>scheduler.run(...args))}};
}
module.exports={wrapScheduler,diagnosticLine};
