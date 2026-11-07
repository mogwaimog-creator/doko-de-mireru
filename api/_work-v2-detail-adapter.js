'use strict';
// Experimental compatibility adapter. NOT wired into production.
// Reconstructs basic TMDB-shaped detail fields from compact work metadata.
// It is intentionally NOT a complete substitute for extensions.tmdbDetail.
function toBasicTmdbDetail(work){
 if(!work||work.schemaVersion!==2||!['movie','tv'].includes(work.type)||!Number.isSafeInteger(work.id))throw Error('Invalid v2 work');
 const tv=work.type==='tv';
 const credits={cast:(work.cast||[]).map(p=>({id:p.id,name:p.name})),crew:work.director?[{...work.director,job:'Director'}]:[]};
 const detail={id:work.id,
  // detail.html consumes normalized fields, not only native TMDB fields.
  title:work.title,release_date:work.releaseDate||'',runtime:work.runtimeMinutes??null,
  director:work.director||null,cast:(work.cast||[]).map(p=>({id:p.id,name:p.name})),
  overview:work.overview||'',poster_path:work.posterPath||null,
  genres:(work.genres||[]).map(name=>({name})),credits,vote_average:work.rating??0,
  ...(tv?{name:work.title,original_name:work.originalTitle||work.title,
    first_air_date:work.releaseDate||'',episode_run_time:work.runtimeMinutes==null?[]:[work.runtimeMinutes],
    number_of_seasons:work.seasonCount??null,number_of_episodes:work.episodeCount??null,
    status:work.status||null,seasons:(work.seasons||[]).map(s=>({
      season_number:s.seasonNumber,name:s.name||'',episode_count:s.episodeCount??0,air_date:s.airDate||null
    }))}:{title:work.title,original_title:work.originalTitle||work.title,
    release_date:work.releaseDate||'',runtime:work.runtimeMinutes??null})
 };
 return detail;
}
// Do not replace v1 detail readers until every downstream field has been audited.
// Not available from compact v2: full cast, backdrop, collection, production,
// full genres IDs, original TMDB credits metadata, and other TMDB-specific fields.
module.exports={toBasicTmdbDetail};
