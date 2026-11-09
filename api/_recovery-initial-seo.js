'use strict';
// Return only fields needed for SEO; full credits never cross Redis->HTML reads.
const {createHash}=require('node:crypto'),{metadataUrl}=require('./_recovery-fixed-work');
const {createSeoRecord}=require('../prototype/seo-ledger');
const PROJECT=`local raw=redis.call('GET',KEYS[1]);local w=nil;local compact=false
if raw then w=cjson.decode(raw);compact=true;if w.schemaVersion~=2 or w.type~=ARGV[1] then return {err='invalid canonical work'} end
else local cached=redis.call('GET',KEYS[2]);if not cached then return false end;local envelope=cjson.decode(cached);if envelope.identity~=ARGV[3] then return {err='cache identity mismatch'} end;w=envelope.data end
if type(w)~='table' or w.id~=tonumber(ARGV[2]) then return {err='work identity mismatch'} end
if compact then return cjson.encode({title=w.title,overview=w.overview,shortIntro=w.shortIntro,releaseDate=w.releaseDate,posterPath=w.posterPath}) end
return cjson.encode({title=w.title or w.name,overview=w.overview,releaseDate=w.release_date or w.first_air_date,posterPath=w.poster_path})`;
async function projectSeo(type,id,{command=require('./_recovery-fetch-cache').devCommand,clock=Date.now}={}){
 const url=new URL(metadataUrl(type,id));url.searchParams.sort();const identity=url.pathname+'?'+url.searchParams.toString(),digest=createHash('sha256').update(identity).digest('hex');
 const raw=await command(['EVAL',PROJECT,'2',require('./_dev-content-ledgers').keys.work(type,id),'doko:dev:recovery:v1:content:'+digest,type,String(id),identity]);
 if(raw===null||raw===false)return null;const fields=JSON.parse(raw);if(typeof fields.title!=='string'||!fields.title.trim())throw Error('invalid work title');return createSeoRecord({type,id,...fields},{updatedAt:new Date(clock()).toISOString()});
}
module.exports={projectSeo,PROJECT};
