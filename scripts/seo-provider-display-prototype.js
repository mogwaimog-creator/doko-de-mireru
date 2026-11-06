'use strict';
// Pure provider-to-display projection. Uses only provider availability and a
// precomputed title; never fetches fixed metadata or accesses Redis.
function find(items,terms){
 const all=[...(items.streaming||[]),...(items.rental||[]),...(items.purchase||[])];
 return all.find(p=>terms.some(t=>String(p.provider_name||'').toLowerCase().includes(t)))||null;
}
function preferred(provider,domain,fallback){
 const link=provider?.provider_url||provider?.url||provider?.link;
 return typeof link==='string'&&/^https?:\/\//i.test(link)&&link.toLowerCase().includes(domain)?link:fallback;
}
function displayProviders(payload,title,type){
 if(!payload||!['movie','tv'].includes(type)||typeof title!=='string')throw Error('Invalid provider display inputs');
 for(const field of ['streaming','rental','purchase'])if(!Array.isArray(payload[field]))throw Error('Incomplete providers: '+field);
 const netflix=find(payload,['netflix']);
 const amazon=find(payload,['amazon','prime video']);
 const unext=find(payload,['u-next','unext']);
 const hulu=find(payload,['hulu']);
 const disney=find(payload,['disney']);
 const apple=find(payload,['apple']);
 const fod=find(payload,['fod']);
 const google=find(payload,['google play','google']);
 const search=encodeURIComponent(title);
 const netflixUrl=netflix?(type==='movie'?'https://www.netflix.com/jp/search':preferred(netflix,'netflix.','https://www.netflix.com/jp/search')):null;
 const amazonUrl=amazon?preferred(amazon,'amazon.','https://www.amazon.co.jp/s?k='+search+'&i=instant-video'):null;
 const unextUrl=unext?preferred(type==='tv'?unext:null,'unext.','https://video.unext.jp/'):null;
 const huluUrl=hulu?preferred(type==='tv'?hulu:null,'hulu.','https://www.hulu.jp/search?q='+search):null;
 const disneyUrl=disney?preferred(type==='tv'?disney:null,'disneyplus.','https://www.disneyplus.com/ja-jp/search/'+search):null;
 const appleUrl=apple?preferred(type==='tv'?apple:null,'apple.','https://tv.apple.com/jp/search?term='+search):null;
 const fodUrl=fod?preferred(fod,'fod.','https://fod.fujitv.co.jp/'):null;
 const googleUrl=google?preferred(google,'google.','https://play.google.com/store/search?q='+search+'&c=movies'):null;
 return {id:payload.id,streaming:payload.streaming,rental:payload.rental,purchase:payload.purchase,
  netflix:netflix?{url:netflixUrl,direct:false}:null,netflix_url:netflixUrl,
  amazon:amazon?{url:amazonUrl}:null,amazon_url:amazonUrl,
  unext_url:unextUrl,hulu_url:huluUrl,disney_url:disneyUrl,apple_tv_url:appleUrl,
  fod:fod?{url:fodUrl}:null,fod_url:fodUrl,
  google_play:google?{url:googleUrl}:null,google_play_url:googleUrl};
}
module.exports={displayProviders};
