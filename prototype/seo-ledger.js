'use strict';
// SEO ledger offline prototype. Output is intended for server-side initial HTML,
// not client-side title replacement. No network, Redis, or live route imports.
const SITE='https://doko-de-mireru.com';
const BRAND='ドコデミレル？';
function identity(type,id){
 if(!['movie','tv'].includes(type)||!Number.isSafeInteger(Number(id))||Number(id)<1)throw Error('invalid work identity');
 return {type,id:Number(id)};
}
function plain(value,max=200){
 return String(value??'').replace(/<[^>]*>/g,' ').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max);
}
function escapeHtml(value){
 return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function createSeoRecord(work,{updatedAt=new Date().toISOString()}={}){
 const {type,id}=identity(work.type,work.id);
 const title=plain(work.title,160);
 if(!title)throw Error('missing work title');
 const year=plain(work.releaseDate||work.release_date,10).slice(0,4);
 const intro=plain(work.shortIntro||work.overview,180);
 const pageTitle=plain(title+(year?'（'+year+'年）':'')+'の配信・作品情報 | '+BRAND,200);
 const description=plain(title+'の作品情報と日本国内の配信状況を確認。'+(intro?intro+' ':'')+'見放題・レンタル・購入の最新情報は作品ページでご確認ください。',260);
 const canonical=SITE+'/detail.html?id='+id+(type==='tv'?'&type=tv':'');
 const poster=typeof work.posterPath==='string'&&/^\/[a-zA-Z0-9_./-]+$/.test(work.posterPath)?'https://image.tmdb.org/t/p/w780'+work.posterPath:null;
 const stamp=new Date(updatedAt).toISOString();
 return {key:type+':'+id,type,id,title:pageTitle,description,canonical,ogType:'video.'+(type==='movie'?'movie':'tv_show'),ogImage:poster,h1:title,synopsis:plain(work.overview,1600),sourceUpdatedAt:stamp,schemaVersion:1};
}
function validateSeoRecord(record){
 const expected=['key','type','id','title','description','canonical','ogType','ogImage','h1','synopsis','sourceUpdatedAt','schemaVersion'];
 if(!record||typeof record!=='object'||Array.isArray(record)||Object.keys(record).sort().join('|')!==expected.sort().join('|'))throw Error('unexpected SEO fields');
 const {type,id}=identity(record.type,record.id);
 if(record.key!==type+':'+id||record.canonical!==SITE+'/detail.html?id='+id+(type==='tv'?'&type=tv':'')||record.schemaVersion!==1)throw Error('invalid SEO identity');
 if(!record.title||!record.h1||!Number.isFinite(Date.parse(record.sourceUpdatedAt)))throw Error('invalid SEO metadata');
 return record;
}
function renderHead(record){
 validateSeoRecord(record);
 const tags=[
 '<title>'+escapeHtml(record.title)+'</title>',
 '<meta name="description" content="'+escapeHtml(record.description)+'">',
 '<link rel="canonical" href="'+escapeHtml(record.canonical)+'">',
 '<meta property="og:type" content="'+escapeHtml(record.ogType)+'">',
 '<meta property="og:title" content="'+escapeHtml(record.title)+'">',
 '<meta property="og:description" content="'+escapeHtml(record.description)+'">',
 '<meta property="og:url" content="'+escapeHtml(record.canonical)+'">'
 ];
 if(record.ogImage)tags.push('<meta property="og:image" content="'+escapeHtml(record.ogImage)+'">');
 return tags.join('\n');
}
function renderInitialHeading(record){
 validateSeoRecord(record);
 return '<h1>'+escapeHtml(record.h1)+'</h1>';
}
module.exports={createSeoRecord,validateSeoRecord,renderHead,renderInitialHeading};
