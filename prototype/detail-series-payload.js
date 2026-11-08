'use strict';
// Read-only server-side adapter. Attach to the existing detail API JSON response.
// Does not access TMDB, Redis, or the network.
const {seriesStreamingProviders}=require('./series-streaming-adapter');
function seriesItems(series){
 if(Array.isArray(series))return series;
 if(series&&Array.isArray(series.movies))return series.movies;
 return [];
}
function isTv(item){
 return ['tv','tv_drama','anime_tv'].includes(item.content_type)||
 ['TVシリーズ','TV','TVアニメ'].includes(item.media_type);
}
function attachSeriesStreaming(detail,ledger){
 if(!detail||typeof detail!=='object'||Array.isArray(detail))throw Error('invalid detail');
 const byWork=Object.create(null);
 for(const item of seriesItems(detail.series)){
  const id=Number(item?.id);
  if(!Number.isSafeInteger(id)||id<1||!item?.title)continue;
  const type=isTv(item)?'tv':'movie',key=type+':'+id;
  if(Object.prototype.hasOwnProperty.call(byWork,key))continue;
  const providers=seriesStreamingProviders(ledger,type,id);
  if(providers!==null)byWork[key]=providers;
 }
 return {...detail,seriesStreamingByWork:byWork};
}
module.exports={attachSeriesStreaming};
