/* Shared series view: editorial headings/order stay owned by each page. */
(()=>{
 'use strict';
 const series=document.currentScript?.dataset.series;if(!series)return;
 let pending=null,snapshot=null,scheduled=false;
 const roots='tr,a[href][class*="card"],.movie,.film-card,.choice,.gundam-film-item,.stream-work,.timeline-card,.tv-work,.hp-movie-card,.mcu-card,.spider-movie-card,.eva-work-card,.eva-work,.film,.main-card,.work,.card,article';
 const keyOf=node=>{if(node.matches('a[href]')){try{const url=new URL(node.getAttribute('href'),location.href);if(!/\/detail\.html$/.test(url.pathname))return null;const id=url.searchParams.get('id'),type=url.searchParams.get('type')||'movie';return /^(movie|tv)$/.test(type)&&/^[1-9][0-9]*$/.test(id||'')?type+':'+id:null}catch{return null}}const id=node.dataset.id||node.dataset.movieId,type=node.dataset.type||node.dataset.mediaType||'movie';return /^(movie|tv)$/.test(type)&&/^[1-9][0-9]*$/.test(id||'')?type+':'+id:null};
 function paint(){
  scheduled=false;if(!snapshot)return;
  const visited=new Map();
  for(const ref of document.querySelectorAll('a[href*="detail.html"],[data-id],[data-movie-id]')){
   const key=keyOf(ref),work=key&&snapshot.works[key];if(!work)continue;
   const root=ref.closest(roots);if(!root||root.closest('[data-ledger-lock="all"]'))continue;
   let keys=visited.get(root);if(!keys){keys=new Set();visited.set(root,keys)}if(keys.has(key))continue;keys.add(key);
   const host=root.tagName==='TR'?(root.querySelector('td.watch-title,td')||root):root;
   let panel=[...host.children].find(n=>n.classList.contains('doko-ledger-fixed')&&n.dataset.workKey===key);
   if(!panel){panel=document.createElement('div');panel.className='doko-ledger-fixed';panel.dataset.workKey=key;panel.style.cssText='font-size:13px;line-height:1.6;color:#526174;padding:6px 10px;grid-column:1/-1;flex-basis:100%;clear:both';host.appendChild(panel)}
   const parts=[work.title];if(/^\d{4}(?:-|$)/.test(work.releaseDate||''))parts.push(work.releaseDate.slice(0,4)+'年');if(Number.isFinite(work.runtimeMinutes)&&work.runtimeMinutes>0)parts.push((work.type==='tv'?'1話約':'')+work.runtimeMinutes+'分');const text='作品情報：'+parts.join(' ・ ');if(panel.textContent!==text)panel.textContent=text;
   panel.dataset.ledgerSource='work';root.dataset.ledgerWork='shared';
   // Chapters, editions and authored poster overrides retain their own images.
   const image=root.querySelector('img.poster,img.film-poster,img.hp-movie-poster,.hp-movie-poster img,.mcu-card-poster img,.eva-work-poster img,[data-poster] img')||[...root.querySelectorAll('img')].find(img=>!img.closest('[class*="provider"],[class*="streaming"],.gundam-availability')&&/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w185|w300|w342|w500|w780|original)\//.test(img.src));
   if(image&&!image.closest('[data-ledger-lock="poster"],[data-ledger-lock="all"]')&&/^https:\/\/image\.tmdb\.org\/t\/p\//.test(image.src)&&/^\/[a-zA-Z0-9._-]+$/.test(work.posterPath||'')){
    const size=image.src.match(/\/t\/p\/([^/]+)\//)?.[1]||'w342';const src='https://image.tmdb.org/t/p/'+size+work.posterPath;if(image.src!==src)image.src=src;image.dataset.ledgerSource='work';
   }
  }
 }
 function schedule(){if(!scheduled){scheduled=true;queueMicrotask(paint)}}
 const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{childList:true,subtree:true});
 window.dokoSeriesBind=(node,type,id)=>{if(node&&/^(movie|tv)$/.test(type)&&Number.isSafeInteger(Number(id))&&Number(id)>0){node.dataset.type=type;node.dataset.id=String(id);schedule()}};
 window.dokoSeriesFetch=(url,options)=>{
  const parsed=new URL(url,location.href);if(!/\/api\/series-watch$/.test(parsed.pathname)||parsed.searchParams.get('series')!==series)return Promise.reject(Error('series identity mismatch'));
  if(!pending)pending=fetch(url,options).then(async response=>{if(!response.ok)throw Error('shared snapshot unavailable');const data=await response.clone().json();if(data.works&&typeof data.works==='object'&&!Array.isArray(data.works)){
   const works={};for(const [key,w] of Object.entries(data.works)){if(w&&key===w.type+':'+w.id&&typeof w.title==='string'&&w.title.trim())works[key]=w}
   snapshot={works};document.documentElement.dataset.seriesLedger=data.complete===true&&Object.keys(works).length===Object.keys(data.works).length?'ready':'incomplete';schedule();
  }else document.documentElement.dataset.seriesLedger='legacy';return response});
  // Each existing consumer gets its own readable response, with just one HTTP request.
  return pending.then(response=>response.clone());
 };
 const start=()=>window.dokoSeriesFetch((location.protocol==='file:'?'https://doko-de-mireru.com':'')+'/api/series-watch?series='+encodeURIComponent(series),{cache:'no-store'}).catch(()=>{document.documentElement.dataset.seriesLedger='unavailable'});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
