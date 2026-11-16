'use strict';
// Offline formatter/storage only. No schedule, Git push, HTTP or DB connection.
const fs=require('node:fs');const path=require('node:path');
const {readJson}=require('./operations-analysis');
const {dailyDifference,dayAt}=require('./lib/operations-analysis');
function buildDaily(current,previous=null) {
  if(current.schemaVersion!==1||!/^\d{4}-\d{2}-\d{2}$/.test(current.day)||!current.ledgers||!Array.isArray(current.alerts)||dayAt(current.observedAt)!==current.day)throw Error('Invalid snapshot');
  const delta=dailyDifference(previous,current);
  return {...current,previousDayDelta:delta,alerts:[...current.alerts,...Object.entries(delta).filter(([,v])=>v.value!==null&&Math.abs(v.value)>100).map(([f])=>f+':前日比の絶対値が100超（要確認）')],dailyMeaning:'当日の採取区間における現在値。日末確定値・当日の処理回数ではない'};
}
function saveDaily(root,report) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(report.day))throw Error('Invalid date');
  const dir=path.resolve(root,report.day.slice(0,4),report.day.slice(5,7));fs.mkdirSync(dir,{recursive:true,mode:0o700});
  const target=path.join(dir,report.day+'.json');
  // Exclusive create: reruns never silently replace an existing historical record.
  fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});return target;
}
if(require.main===module){try{const [current,previous,root,...extra]=process.argv.slice(2);if(!current||!previous||!root||extra.length)throw Error();saveDaily(root,buildDaily(readJson(current),previous==='-'?null:readJson(previous)));console.log('Saved daily report.');}catch{console.error('FAIL: daily report not saved; invalid input or existing output.');process.exitCode=1;}}
module.exports={buildDaily,saveDaily};
