'use strict';
// Preview-only HTML transform. Reads an existing detail.html template and a saved SEO record.
// Does not fetch TMDB or write to production. Not wired into vercel.json.
const {validateSeoRecord}=require('./seo-ledger');
function esc(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function setMeta(html,attribute,value,content){
 const safe=esc(content);
 const re=new RegExp('(<meta\\s+[^>]*'+attribute+'\\s*=\\s*["\\x27]'+value+'["\\x27][^>]*content\\s*=\\s*["\\x27])[^"\\x27]*(["\\x27][^>]*>)','i');
 if(re.test(html))return html.replace(re,(_,a,b)=>a+safe+b);
 // Existing template may have content before property/name, or line breaks.
 const tag=new RegExp('<meta\\b(?=[^>]*'+attribute+'\\s*=\\s*["\\x27]'+value+'["\\x27])[^>]*>','i');
 if(!tag.test(html))throw Error('missing meta '+value);
 return html.replace(tag,m=>{
  if(/\\bcontent\\s*=\\s*(["\\x27])[^"\\x27]*\\1/i.test(m))return m.replace(/\\bcontent\\s*=\\s*(["\\x27])[^"\\x27]*\\1/i,'content="'+safe+'"');
  return m.replace(/>$/,' content="'+safe+'">');
 });
}
function renderDetailHtml(template,record){
 validateSeoRecord(record);
 if(typeof template!=='string'||!template.includes('</head>'))throw Error('invalid detail template');
 let html=template;
 if(!/<title>[\\s\\S]*?<\\/title>/i.test(html))throw Error('missing title');
 html=html.replace(/<title>[\\s\\S]*?<\\/title>/i,'<title>'+esc(record.title)+'</title>');
 html=setMeta(html,'name','description',record.description);
 html=setMeta(html,'property','og:type',record.ogType);
 html=setMeta(html,'property','og:title',record.title);
 html=setMeta(html,'property','og:description',record.description);
 html=setMeta(html,'property','og:url',record.canonical);
 if(record.ogImage)html=setMeta(html,'property','og:image',record.ogImage);
 const canonical=/<link\\b(?=[^>]*rel\\s*=\\s*["\\x27]canonical["\\x27])[^>]*>/i;
 if(!canonical.test(html))throw Error('missing canonical link');
 html=html.replace(canonical,'<link id="canonical" rel="canonical" href="'+esc(record.canonical)+'">');
 const h1=/<h1\\b(?=[^>]*id\\s*=\\s*["\\x27]title["\\x27])[^>]*>[\\s\\S]*?<\\/h1>/i;
 if(!h1.test(html))throw Error('missing title heading');
 html=html.replace(h1,'<h1 id="title">'+esc(record.h1)+'</h1>');
 return html;
}
module.exports={renderDetailHtml};
