'use strict';
// Shared by the JSON detail API and the initial HTML route. No provider fetch.
const {identity}=require('./_work-ledger-v2-schema');
const {toBasicTmdbDetail}=require('./_work-v2-detail-adapter');
function metadataUrl(type,id,apiKey){
 identity(type,id);const url=new URL(`https://api.themoviedb.org/3/${type}/${Number(id)}`);
 url.searchParams.set('language','ja-JP');url.searchParams.set('append_to_response','credits');if(apiKey)url.searchParams.set('api_key',apiKey);return url.toString();
}
async function readWork(type,id,{command=require('./_recovery-fetch-cache').devCommand,load,readSaved}={}){
 const checked=identity(type,id),dev=require('./_dev-content-ledgers');
 const existing=await command(['GET',dev.keys.work(checked.type,checked.id)]);
 // A malformed existing record is an error; never fall through and replace manual data.
 if(existing!==null)return (readSaved||((t,i)=>dev.readWork(t,i,{command})))(checked.type,checked.id);
 const saved=await require('./_new-work-ingest').ingest(checked.type,checked.id,{command,load});
 return {...toBasicTmdbDetail(saved),ledgerManaged:true};
}
module.exports={metadataUrl,readWork};
