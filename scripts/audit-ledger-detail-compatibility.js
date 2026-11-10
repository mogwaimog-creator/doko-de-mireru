'use strict';
// Offline field-level contract audit. No network, Redis or TMDB calls.
const {toDetailFixed}=require('./work-ledger-to-detail-fixed');
const COMMON=['id','title','original_title','media_type','runtime','release_date','poster_path','overview','vote_average','original_language','genres','cast','series','recommendations'];
const MOVIE=['vote_count','director'];
const TV=['content_type','backdrop_path','creators','number_of_seasons','number_of_episodes','status','seasons'];
const DYNAMIC=['streaming','rental','purchase','link','netflix','netflix_url','amazon','amazon_url','unext_url','hulu_url','disney_url','apple_tv_url','apple_url','fod','fod_url','google_play','google_play_url'];
function audit(record){
 const converted=toDetailFixed(record);
 const required=[...COMMON,...(record.type==='movie'?MOVIE:TV)];
 const missing=required.filter(key=>!Object.hasOwn(converted,key));
 const extra=Object.keys(converted).filter(key=>!required.includes(key));
 const leaked=DYNAMIC.filter(key=>Object.hasOwn(converted,key));
 return {type:record.type,id:record.id,missing,extra,leaked,ready:missing.length===0&&leaked.length===0};
}
module.exports={audit,COMMON,MOVIE,TV,DYNAMIC};
