'use strict';
// Development-only saved content. No production credentials, writes, or TMDB fallback.
const {devCommand}=require('./_shared-streaming-read');
const {identity}=require('./_work-ledger-v2-schema');
const {toBasicTmdbDetail}=require('./_work-v2-detail-adapter');
const season=require('../prototype/season-ledger');
function enabled(){return process.env.DEV_CONTENT_LEDGER_ENABLED==='1'&&process.env.VERCEL_ENV!=='production'&&process.env.NODE_ENV!=='production'}
const keys={work:(type,id)=>{identity(type,id);return 'doko:dev:work:v2:'+type+':'+Number(id)},season:id=>'doko:dev:season:v1:tv:'+identity('tv',id).id,person:id=>'doko:dev:person:v2:'+identity('movie',id).id,seo:(type,id)=>{identity(type,id);return 'doko:dev:seo:v1:'+type+':'+Number(id)}};
function decode(raw){return raw===null?null:JSON.parse(raw)}
function unavailable(){const e=Error('Saved development content unavailable');e.code='WORK_METADATA_INCOMPLETE';return e}
async function readWork(type,id,{command=devCommand}={}){
 if(!enabled())return null;
 const names=[keys.work(type,id),...(type==='tv'?[keys.season(id)]:[]),'doko:dev:legacy-work:v1:'+type+':'+Number(id)];
 const raw=await command(['MGET',...names]);if(!Array.isArray(raw)||raw.length!==names.length)throw unavailable();
 const work=decode(raw[0]);if(!work||work.type!==type||work.id!==Number(id)||work.schemaVersion!==2)throw unavailable();
 const legacy=decode(raw.at(-1));
 const result=require('./_work-v2-legacy-compat').enrich({...toBasicTmdbDetail(work),ledgerManaged:true},work,legacy);
 // Explicit related/collection links only. Editorial watch-order membership is not a collection.
 const links=require('./_work-ledger-editorial').normalizeLinks(legacy?.relatedWorkIds).filter(w=>['related','collection'].includes(w.kind)&&!(w.type===type&&w.id===Number(id)));
 if(links.length>100)throw unavailable();
 if(links.length){
  const selected=[...new Map(links.map(w=>[w.type+':'+w.id,w])).values()];
  const related=await command(['MGET',...selected.map(w=>keys.work(w.type,w.id))]);if(!Array.isArray(related)||related.length!==selected.length)throw unavailable();
  result.savedRelated=related.flatMap((value,i)=>{const target=decode(value),ref=selected[i];if(!target)return [];if(target.schemaVersion!==2||target.type!==ref.type||target.id!==ref.id)throw unavailable();return [{id:target.id,title:target.title,poster_path:target.posterPath,release_date:target.releaseDate||'',content_type:target.type,media_type:target.type==='tv'?'TVシリーズ':'映画'}]});
 }

 if(type==='tv'){
  const seasons=decode(raw[1]);if(!seasons||seasons.tvId!==Number(id))throw unavailable();
  const list=season.toDetailSeasons(seasons);
  result.seasons=list;result.number_of_seasons=list.length;
  result.number_of_episodes=list.every(s=>Number.isSafeInteger(s.episode_count))?list.reduce((n,s)=>n+s.episode_count,0):null;
 }
 return result;
}
async function readPerson(id,{command=devCommand}={}){
 if(!enabled())return null;
 const record=decode(await command(['GET',keys.person(id)]));
 require('../prototype/person-ledger').validateRecord(record);
 if(record.person.id!==Number(id))throw unavailable();return record.person;
}
async function readSeason(id,number,{command=devCommand}={}){
 if(!enabled())return null;
 if(!Number.isSafeInteger(number)||number<1)throw unavailable();
 const record=decode(await command(['GET',keys.season(id)]));
 if(!record||record.tvId!==Number(id))throw unavailable();const response=season.toDetailEpisodes(record,number);
 if(!response)throw unavailable();return response;
}
async function readSeo(type,id,{command=devCommand}={}){
 if(!enabled())return null;
 const raw=await command(['MGET',keys.seo(type,id),keys.work(type,id),keys.seo(type,id)+':meta']);
 if(!Array.isArray(raw)||raw.length!==3)throw unavailable();
 const r=decode(raw[0]),work=decode(raw[1]),meta=decode(raw[2]);require('../prototype/seo-ledger').validateSeoRecord(r);
 if(r.type!==type||r.id!==Number(id))throw unavailable();
 if(meta?.sourceDigest&&(!work||require('./_dev-content-store').digest(work)!==meta.sourceDigest))throw unavailable();
 return r;
}
module.exports={enabled,keys,readWork,readPerson,readSeason,readSeo};
