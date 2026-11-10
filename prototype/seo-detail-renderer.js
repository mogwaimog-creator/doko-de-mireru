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
function renderDetailHtml(template,record){
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
 // Show the saved synopsis in the initial HTML without making any new API call.
 // The existing client can replace this text with its normal rendered version.
 const synopsis=/<div\\b(?=[^>]*\\bid\\s*=\\s*(["'])overview\\1)[^>]*>[\\s\\S]*?<\\/div>/i;
 if(record.synopsis&&synopsis.test(html))html=html.replace(synopsis,()=>'<div id="overview" class="side-text overview-text">'+esc(record.synopsis)+'</div>');
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
