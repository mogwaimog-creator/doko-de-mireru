'use strict';
// One bounded local supervisor session. Can be restarted; Redis keeps progress.
if(process.env.DEV_ISOLATED_WORKER!=='1'||process.env.VERCEL_ENV==='production'||process.env.NODE_ENV==='production')throw Error('explicit local fixture worker required');
const {command}=require('../tests/helpers/local-redis'),{sharedStore}=require('../api/_shared-streaming-store'),{compactDailyJobStore}=require('../api/_compact-daily-job-store'),{dailyJob}=require('../api/_streaming-daily-job'),{supervisor}=require('../api/_daily-job-supervisor');
const at=new Date().toISOString(),works=require('./audit-shared-ledgers').inventory().records;
const job=dailyJob(sharedStore(command),compactDailyJobStore(command),async()=>({results:{JP:{flatrate:[],rent:[],buy:[]}}}));
const stop=new AbortController();process.once('SIGINT',()=>stop.abort());process.once('SIGTERM',()=>stop.abort());
supervisor(job).run(at,works,{maxItems:24,signal:stop.signal}).then(result=>{console.log(JSON.stringify({scope:'loopback fixture data only; never live availability',...result},null,2));if(result.status==='stopped')process.exitCode=2}).catch(e=>{console.error(e.message);process.exitCode=2});
