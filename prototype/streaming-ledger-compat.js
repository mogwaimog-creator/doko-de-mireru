'use strict';
// Pure compatibility adapter. No Redis/TMDB calls or production changes.
const {providers}=require('./streaming-ledger');
function fromTmdb(payload){
 const results=payload?.results;
 if(!results||typeof results!=='object'||Array.isArray(results))throw Error('invalid TMDB provider response');
 // Missing JP is legitimate "not available in Japan", not a US fallback.
 const jp=results.JP;
 if(jp!==undefined&&(!jp||typeof jp!=='object'||Array.isArray(jp)))throw Error('invalid Japan provider response');
 return {JP:providers(jp||{})};
}
function toDetail(ledger,type,id){
 const saved=ledger.detail(type,id);
 if(!saved?.lastSuccessAt)return null;
 return {data:{results:{JP:{flatrate:saved.japan.flatrate.map(toTmdb),rent:saved.japan.rent.map(toTmdb),buy:saved.japan.buy.map(toTmdb)}}},checkedAt:saved.lastSuccessAt};
}
function toWatch(ledger,type,id){
 const saved=ledger.detail(type,id);
 if(!saved?.lastSuccessAt)return null;
 return {flatrate:saved.japan.flatrate.map(toTmdb),checkedAt:saved.lastSuccessAt};
}
function toTmdb(p){return {provider_id:p.providerId,provider_name:p.name,logo_path:p.logoPath}}
module.exports={fromTmdb,toDetail,toWatch};
