/* Existing 13 series: authored fixed content; shared streaming snapshot only. */
(()=>{
 'use strict';
 const series=document.currentScript?.dataset.series;if(!series)return;
 let pending=null;
 window.dokoSeriesFetch=(url,options)=>{
  const parsed=new URL(url,location.href);
  if(!/\/api\/series-watch$/.test(parsed.pathname)||parsed.searchParams.get('series')!==series)return Promise.reject(Error('series identity mismatch'));
  if(!pending)pending=fetch(url,options).then(response=>{if(!response.ok)throw Error('shared streaming unavailable');return response});
  // Existing page code alone renders its streaming logos, tables and tabs.
  // Never inspect work metadata or mutate authored titles, posters or markup.
  return pending.then(response=>response.clone());
 };
})();
