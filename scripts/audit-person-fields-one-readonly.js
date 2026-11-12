'use strict';
// Read-only: one GET, field names only, no values, no secrets, no mutations.
const url=(process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL||'').replace(/\/$/,'');
const token=process.env.KV_REST_API_READ_ONLY_TOKEN;
if(!url||!token){console.error('READ ONLY credentials not configured; no request made.');process.exit(1)}
const id=Number(process.argv[2]||1813);
if(!Number.isSafeInteger(id)||id<1)throw Error('invalid person ID');
(async()=>{
 const response=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(['GET','doko:person:v1:'+id]),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('HTTP '+response.status);
 const result=await response.json();
 if(result.error)throw Error('Redis read failed');
 const record=typeof result.result==='string'?JSON.parse(result.result):result.result;
 if(!record){console.log('No existing record for sample ID');return}
 const person=record.person||{};
 console.log('READ ONLY: 1 GET; field names only; no personal values.');
 console.log('Record fields:',Object.keys(record).sort().join(', '));
 console.log('Person fields:',Object.keys(person).sort().join(', '));
 for(const group of ['cast','voice','directed','documentary_talk','other']){
  const list=Array.isArray(person[group])?person[group]:[];
  const sample=list.find(x=>x&&typeof x==='object');
  console.log(group+' count:',list.length,'fields:',sample?Object.keys(sample).sort().join(', '):'(none)');
 }
})().catch(e=>{console.error('Inspection stopped:',e.message);process.exitCode=1});
