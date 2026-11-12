'use strict';
// Preview-only: transforms an existing HTML template using a saved SEO record.
// No production routes, Redis, or TMDB access.
const {validateSeoRecord}=require('./seo-ledger');
function esc(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function setMeta(html,attribute,value,content){
 const tag=/<meta\b[^>]*>/gi;
 let found=false;
 const result=html.replace(tag,m=>{
  const prop=new RegExp('\\b'+attribute+'\\s*=\\s*(["\\x27])'+value+'\\1','i');
  if(!prop.test(m))return m;
  found=true;
  const safe=esc(content);
  if(/\bcontent\s*=\s*(["'])[^"']*\1/i.test(m))return m.replace(/\bcontent\s*=\s*(["'])[^"']*\1/i,()=> 'content="'+safe+'"');
  return m.replace(/>$/,()=> ' content="'+safe+'">');
 });
 if(!found)throw Error('missing meta '+value);
 return result;
}
function renderDetailHtml(template,record,{overview='',releaseDate='',posterPath='',genres=[],streaming=null}={}){
 validateSeoRecord(record);
 if(typeof template!=='string'||!template.includes('</head>'))throw Error('invalid detail template');
 let html=template;
 // Marks server-rendered SEO so legacy client JS leaves initial metadata intact.
 if(!/<html\b/i.test(html))throw Error('missing html element');
 html=html.replace(/<html\b/i,()=>'<html data-seo-ledger="1"');
 if(!/<title>[\s\S]*?<\/title>/i.test(html))throw Error('missing title');
 html=html.replace(/<title>[\s\S]*?<\/title>/i,()=>'<title>'+esc(record.title)+'</title>');
 for(const [attribute,value,content] of [
  ['name','description',record.description],
  ['property','og:type',record.ogType],
  ['property','og:title',record.title],
  ['property','og:description',record.description],
  ['property','og:url',record.canonical],
  ['name','twitter:title',record.title],
  ['name','twitter:description',record.description]
 ])html=setMeta(html,attribute,value,content);
 if(record.ogImage){
  html=setMeta(html,'property','og:image',record.ogImage);
  html=setMeta(html,'name','twitter:image',record.ogImage);
 }
 const canonical=/<link\b(?=[^>]*\brel\s*=\s*(["'])canonical\1)[^>]*>/i;
 if(!canonical.test(html))throw Error('missing canonical link');
 html=html.replace(canonical,()=>'<link id="canonical" rel="canonical" href="'+esc(record.canonical)+'">');
 const h1=/<h1\b(?=[^>]*\bid\s*=\s*(["'])title\1)[^>]*>[\s\S]*?<\/h1>/i;
 if(!h1.test(html))throw Error('missing title heading');
 html=html.replace(h1,()=>'<h1 id="title">'+esc(record.h1)+'</h1>');
 // Preserve the existing layout; provide the saved synopsis to crawlers before JS runs.
 const summary=String(overview||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200);
 if(summary){
  const target=/<div\b(?=[^>]*\bid\s*=\s*(["'])overview\1)[^>]*>[\s\S]*?<\/div>/i;
  if(!target.test(html))throw Error('missing overview container');
  html=html.replace(target,tag=>tag.replace(/<\/div>$/i,()=>esc(summary)+'</div>'));
 }
 // Basic work facts and structured data are derived from the saved ledger only.
 const year=String(releaseDate||'').match(/^\d{4}/)?.[0]||'';
 if(year){
  const release=/<div\b(?=[^>]*\bid\s*=\s*(["'])releaseDate\1)[^>]*>[\s\S]*?<\/div>/i;
  if(release.test(html))html=html.replace(release,tag=>tag.replace(/<\/div>$/i,()=>esc('公開年：'+year+'年')+'</div>'));
 }
 const names=Array.isArray(genres)?genres.map(g=>typeof g==='string'?g:g?.name).filter(v=>typeof v==='string'&&v.trim()).slice(0,8):[];
 const jsonLd={'@context':'https://schema.org','@type':record.type==='tv'?'TVSeries':'Movie',name:record.h1,url:record.canonical,description:summary||record.description};
 if(releaseDate)jsonLd.datePublished=String(releaseDate).slice(0,10);
 if(record.ogImage)jsonLd.image=record.ogImage;
 if(names.length)jsonLd.genre=names;
 const safeJson=JSON.stringify(jsonLd).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 html=html.replace('</head>','<script type="application/ld+json" id="serverWorkStructuredData">'+safeJson+'</script>\n</head>');
 // Streaming is read-only: never refresh TMDB while producing SEO HTML.
 if(streaming&&typeof streaming==='object'){
  const groups=[['flatrate','見放題'],['rent','レンタル'],['buy','購入']];
  const lines=groups.map(([kind,label])=>{
   const names=(Array.isArray(streaming[kind])?streaming[kind]:[])
    .map(p=>typeof p==='string'?p:p?.name||p?.provider_name)
    .filter(n=>typeof n==='string'&&n.trim()).slice(0,20);
   return names.length?'<p><strong>'+label+'：</strong>'+names.map(esc).join('、')+'</p>':'';
  }).filter(Boolean);
  const notice=streaming.lastSuccessAt?'<p>配信情報の最終取得：'+esc(streaming.lastSuccessAt)+'</p>':'';
  const body=lines.length?lines.join('')+notice:'<p>保存済みの配信先は確認できません。視聴前に各公式サイトでご確認ください。</p>';
  const target=/<div\b(?=[^>]*\bid\s*=\s*(["'])providers\1)[^>]*>[\s\S]*?<\/div>/i;
  if(!target.test(html))throw Error('missing provider container');
  html=html.replace(target,tag=>tag.replace(/<\/div>$/i,()=>'<div id="serverProviders">'+body+'</div></div>'));
 }
 // The original template hides #content until JavaScript finishes. Expose the
 // saved heading in initial HTML, while later JS may still hide it on an error.
 for(const [selector,value] of [
  [/<div\b(?=[^>]*\bid\s*=\s*(["'])content\1)[^>]*>/i,'block'],
  [/<div\b(?=[^>]*\bid\s*=\s*(["'])loading\1)[^>]*>/i,'none']
 ])html=html.replace(selector,tag=>{
  const style=/\bstyle\s*=\s*(["'])(.*?)\1/i;
  if(style.test(tag))return tag.replace(style,(_match,quote,text)=>'style='+quote+text.replace(/(?:^|;)\s*display\s*:[^;]*/gi,'')+';display:'+value+';'+quote);
  return tag.replace(/>$/,()=> ' style="display:'+value+';">');
 });
 return html;
}
module.exports={renderDetailHtml};
