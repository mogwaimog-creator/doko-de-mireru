'use strict';
// Server-side SEO metadata rendering. Pure functions: no TMDB, Redis or streaming calls.
const SITE='https://doko-de-mireru.com';
const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
function validId(id){return /^\d+$/.test(String(id))&&Number.isSafeInteger(Number(id))&&Number(id)>0;}
function workSeo(work){
  if(!work||!['movie','tv'].includes(work.type)||!validId(work.id)||!String(work.title||'').trim())throw Error('Invalid work');
  const title=String(work.title).trim();
  const url=`${SITE}/detail.html?id=${Number(work.id)}${work.type==='tv'?'&type=tv':''}`;
  return {title:`${title}はどこで見れる？配信・サブスク・見放題情報 | ドコデミレル？`,description:`${title}はどこで見れる？作品情報と配信・サブスク・見放題の状況を確認できます。`,url};
}
function personSeo(person){
  if(!person||!validId(person.id)||!String(person.name||'').trim())throw Error('Invalid person');
  const name=String(person.name).trim();
  return {title:`${name}の映画・出演作品一覧｜ドコデミレル？`,description:`${name}の映画・ドラマなど出演作品を一覧で紹介。出演作品から配信情報を確認できます。`,url:`${SITE}/person.html?id=${Number(person.id)}`};
}
function replaceOnce(html,re,replacement,label){
  const matches=html.match(new RegExp(re.source,re.flags.includes('g')?re.flags:re.flags+'g'))||[];
  if(matches.length!==1)throw Error(`Expected one ${label}, got ${matches.length}`);
  return html.replace(re,()=>replacement);
}
function injectSeo(template,kind,record){
  const seo=kind==='work'?workSeo(record):kind==='person'?personSeo(record):null;
  if(!seo)throw Error('Unknown page kind');
  let html=String(template);
  html=replaceOnce(html,/<title\b[^>]*>[\s\S]*?<\/title>/i,`<title>${escapeHtml(seo.title)}</title>`,'title');
  html=replaceOnce(html,/<meta\b(?=[^>]*\bname\s*=\s*["']description["'])[^>]*>/i,`<meta id="metaDescription" name="description" content="${escapeHtml(seo.description)}">`,'description');
  html=replaceOnce(html,/<link\b(?=[^>]*\brel\s*=\s*["']canonical["'])[^>]*>/i,`<link id="${kind==='work'?'canonical':'canonicalLink'}" rel="canonical" href="${escapeHtml(seo.url)}">`,'canonical');
  for(const [property,id,value] of [['og:title','ogTitle',seo.title],['og:description','ogDescription',seo.description],['og:url','ogUrl',seo.url]]){
    const re=new RegExp('<meta\\b(?=[^>]*\\bproperty\\s*=\\s*["\\\']'+property+'["\\\'])[^>]*>','i');
    html=replaceOnce(html,re,`<meta id="${id}" property="${property}" content="${escapeHtml(value)}">`,property);
  }
  // Include source-ledger content in the initial HTML, not just the head.
  // Existing client-side rendering remains authoritative after hydration.
  const setInitialText=(id,value)=>{
    if(typeof value!=='string'||!value.trim())return;
    const re=new RegExp(String.raw`(<(?:h1|div|p)\b[^>]*\bid=["']${id}["'][^>]*>)(\s*)(<\/(?:h1|div|p)>)`,'i');
    html=replaceOnce(html,re,(_match)=>_match,'initial '+id);
    html=html.replace(re,(_all,open,_space,close)=>open+escapeHtml(value.trim())+close);
  };
  if(kind==='work'){
    setInitialText('title',record.title);
    setInitialText('overview',record.overview);
  }else{
    setInitialText('personName',record.name);
    setInitialText('personBiography',record.biography);
  }
  return html;
}
module.exports={workSeo,personSeo,injectSeo,escapeHtml};
