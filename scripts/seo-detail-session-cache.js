'use strict';
// Browser-only short-lived response reuse for generated SEO detail pages.
// Never retain an error, never cross the JST 06:00/18:00 refresh boundary.
function dokoJstRefreshSlot(now){
 const jst=new Date(now+9*60*60*1000);
 const date=jst.toISOString().slice(0,10);
 const hour=jst.getUTCHours();
 return date+'-'+(hour>=18?'18':hour>=6?'06':'previous18');
}
async function dokoCachedDetailFetch(url,options){
 const key='doko:seo-detail:v1:'+url;
 const now=Date.now();
 try{
  const cached=JSON.parse(sessionStorage.getItem(key)||'null');
  if(cached&&cached.expires>now&&cached.slot===dokoJstRefreshSlot(now)&&
     typeof cached.text==='string'){
   return new Response(cached.text,{status:200,headers:{'Content-Type':'application/json'}});
  }
 }catch(ignore){}
 const response=await fetch(url,options);
 if(response.ok){
  try{
   const text=await response.clone().text();
   const data=JSON.parse(text);
   if(data&&data.fixed&&data.dynamic&&data.fixed.id&&
      String(data.fixed.id)===String(data.dynamic.id)){
    sessionStorage.setItem(key,JSON.stringify({
     text,slot:dokoJstRefreshSlot(Date.now()),expires:Date.now()+5*60*1000
    }));
   }
  }catch(ignore){}
 }
 return response;
}
if(typeof module!=='undefined'&&module.exports)module.exports={dokoJstRefreshSlot,dokoCachedDetailFetch};
