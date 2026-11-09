'use strict';
// Shared compact metadata, membership order; no TMDB and no editorial mutation.
async function readMany(works,{command=require('./_recovery-fetch-cache').devCommand}={}){
 if(!Array.isArray(works)||works.length>1000)throw Error('bounded series roster required');
 const {keys}=require('./_dev-content-ledgers'),out={},missing=[];
 for(let i=0;i<works.length;i+=32){const group=works.slice(i,i+32),values=await command(['MGET',...group.map(w=>keys.work(w.type,w.id))]);if(!Array.isArray(values)||values.length!==group.length)throw Error('incomplete shared work batch');for(let j=0;j<group.length;j++){const ref=group[j],key=ref.type+':'+ref.id;if(values[j]===null){missing.push(key);continue}const w=JSON.parse(values[j]);if(w.schemaVersion!==2||w.type!==ref.type||w.id!==ref.id||typeof w.title!=='string'||!w.title.trim())throw Error('invalid series work identity');out[key]={type:w.type,id:w.id,title:w.title,posterPath:w.posterPath??null,releaseDate:w.releaseDate??null,runtimeMinutes:w.runtimeMinutes??null}}}
 return {works:out,missing};
}
module.exports={readMany};
