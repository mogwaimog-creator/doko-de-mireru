'use strict';
// Read-only enrichment from an isolated v1 copy. Compact/manual fields win.
function enrich(detail,work,legacy){
 if(legacy&&(legacy.schemaVersion!==1||legacy.type!==work.type||legacy.id!==work.id))throw Error('legacy work identity mismatch');
 const old=legacy?.extensions?.tmdbDetail;
 if(!old)return detail;
 if(legacy.schemaVersion!==1||legacy.type!==work.type||legacy.id!==work.id||old.id!==work.id)throw Error('legacy work identity mismatch');
 const out={...detail,ledgerManaged:true};
 for(const [field,source] of [['backdrop_path','backdrop_path'],['production_countries','production_countries'],['production_companies','production_companies'],['spoken_languages','spoken_languages'],['belongs_to_collection','belongs_to_collection']])if(old[source]!=null)out[field]=old[source];
 out.genres=out.genres.map(g=>{const matching=(old.genres||[]).find(x=>x.name===g.name);return matching?.id?{...g,id:matching.id}:g});
 const cast=out.credits.cast.map(p=>{const match=(old.credits?.cast||[]).find(x=>x.id===p.id);return match?{...p,character:match.character||'',profile_path:match.profile_path||null}:p});
 out.credits={...out.credits,cast};out.cast=cast;
 return out;
}
module.exports={enrich};
