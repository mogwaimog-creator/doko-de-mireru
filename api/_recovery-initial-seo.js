'use strict';
// Return only fields needed for SEO; full credits never cross Redis->HTML reads.
const {createSeoRecord}=require('../prototype/seo-ledger');
const PROJECT=`local raw=redis.call('GET',KEYS[1]);if not raw then return false end;local w=cjson.decode(raw)
if w.schemaVersion~=2 or w.type~=ARGV[1] or w.id~=tonumber(ARGV[2]) then return {err='invalid canonical work'} end
return cjson.encode({title=w.title,overview=w.overview,shortIntro=w.shortIntro,releaseDate=w.releaseDate,posterPath=w.posterPath})`;
async function projectSeo(type,id,{command=require('./_recovery-fetch-cache').devCommand,clock=Date.now}={}){
 const raw=await command(['EVAL',PROJECT,'1',require('./_dev-content-ledgers').keys.work(type,id),type,String(id)]);
 if(raw===null||raw===false)return null;const fields=JSON.parse(raw);if(typeof fields.title!=='string'||!fields.title.trim())throw Error('invalid work title');return createSeoRecord({type,id,...fields},{updatedAt:new Date(clock()).toISOString()});
}
module.exports={projectSeo,PROJECT};
