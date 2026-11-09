'use strict';
// Shared by the JSON detail API and the initial HTML route. No provider fetch.
const {identity}=require('./_work-ledger-v2-schema');
const {verified}=require('./_frozen-load');
function metadataUrl(type,id,apiKey){
 identity(type,id);const url=new URL(`https://api.themoviedb.org/3/${type}/${Number(id)}`);
 url.searchParams.set('language','ja-JP');url.searchParams.set('append_to_response','credits');if(apiKey)url.searchParams.set('api_key',apiKey);return url.toString();
}
async function readWork(type,id,{command=require('./_shared-streaming-read').devCommand,load,readSaved}={}){
 const checked=identity(type,id),dev=require('./_dev-content-ledgers');
 const existing=await command(['GET',dev.keys.work(checked.type,checked.id)]);
 // A malformed existing record is an error; never fall through and replace manual data.
 if(existing!==null)return (readSaved||((t,i)=>dev.readWork(t,i,{command})))(checked.type,checked.id);
 const raw=verified(await load(),checked.id,'work',checked.type);
 const {['watch/providers']:unused,...fixed}=raw;return {...fixed,ledgerManaged:true};
}
module.exports={metadataUrl,readWork};
