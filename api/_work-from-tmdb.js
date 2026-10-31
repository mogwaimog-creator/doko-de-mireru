'use strict';

// Convert TMDB movie/TV detail responses to the common metadata schema.
// Watch providers are deliberately excluded from this ledger.
function fromTmdb(type, item) {
  if (!item || typeof item !== 'object') throw new Error('Missing TMDB detail');
  const isTv = type === 'tv';
  const credits = item.credits || {};
  const directors = (credits.crew || []).filter(p => p.job === 'Director').slice(0, 10)
    .map(p => ({ id: p.id, name: p.name }));
  const cast = (credits.cast || []).slice(0, 30)
    .map(p => ({ id: p.id, name: p.name, character: p.character || null, profilePath: p.profile_path || null }));
  const collection = !isTv ? item.belongs_to_collection : null;
  return {
    title: isTv ? (item.name || item.original_name) : (item.title || item.original_title),
    originalTitle: isTv ? item.original_name : item.original_title,
    releaseDate: isTv ? item.first_air_date : item.release_date,
    overview: item.overview,
    runtimeMinutes: isTv ? (item.episode_run_time || [])[0] : item.runtime,
    genres: (item.genres || []).map(g => ({ id: g.id, name: g.name })),
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path,
    directors,
    cast,
    collectionId: collection && collection.id || null,
    collectionName: collection && collection.name || null,
    seasons: isTv ? (item.seasons || []).map(s => ({
      id: s.id, seasonNumber: s.season_number, name: s.name,
      episodeCount: s.episode_count, airDate: s.air_date, posterPath: s.poster_path
    })) : [],
    status: isTv ? item.status : null,
    voteAverage: item.vote_average,
    voteCount: item.vote_count
  };
}

module.exports = { fromTmdb };
