'use strict';
// Imports an explicitly supplied v1 copy into LOCAL content keys only.
// The caller obtains the copy separately; this module never reads production.
const {normalizeWorkV2}=require('./_work-ledger-v2-schema');
const {createSeoRecord}=require('../prototype/seo-ledger');
const {makeRecord}=require('../prototype/season-ledger');
const {digest}=require('./_dev-content-store');
async function importWork(store,source,at){
 if(!source||source.schemaVersion!==1)throw Error('v1 work copy required');
 const work=normalizeWorkV2(source.type,source.id,source),{type,id}=work;
 const wk=store.keys.work(type,id),sk=store.keys.seo(type,id),lk=`doko:dev:legacy-work:v1:${type}:${id}`,tk=type==='tv'?store.keys.season(id):null;
 const names=[wk,sk,lk,...(tk?[tk]:[])],snapshot=await store.read(names);
 if(names.some(k=>snapshot[k].data))return {saved:false,reason:'existing-content-preserved'};
 // Preserve a read-only compatibility copy without duplicating provider data.
 const copy=JSON.parse(JSON.stringify(source));
 if(copy.extensions?.tmdbDetail){const raw=copy.extensions.tmdbDetail;if(raw.id!==id)throw Error('legacy detail identity mismatch');delete raw['watch/providers'];}
 const data=new Map([[wk,work],[lk,copy]]);
 if(tk){
  if(!Array.isArray(source.seasons))throw Error('TV season manifest required');
  data.set(tk,makeRecord(id,source.seasons,at));delete work.seasons;delete work.seasonCount;delete work.episodeCount;
 }
 data.set(sk,createSeoRecord(work,{updatedAt:at}));
 const entries=[...data].map(([key,value])=>({key,data:value,revision:snapshot[key].meta.revision,meta:key===sk?{sourceDigest:digest(work)}:{importedAt:at}}));
 return store.commit(entries,{mode:'reviewed'});
}
module.exports={importWork};
