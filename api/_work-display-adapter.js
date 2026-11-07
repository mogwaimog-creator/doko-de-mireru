'use strict';
// Pure display adapter for the new lightweight work ledger.
// No Redis, TMDB, environment flags, or writes.
// Only maps existing approved common fields; does not extend the storage schema.
// NOT wired to production or the existing detail handler.
function workToDetail(work) {
  if (!work || !['movie','tv'].includes(work.type) ||
      !Number.isSafeInteger(work.id) || work.id <= 0 ||
      typeof work.title !== 'string' || !work.title.trim()) {
    throw new Error('Invalid lightweight work record');
  }
  const tv = work.type === 'tv';
  const cast = Array.isArray(work.cast) ? work.cast : [];
  const directors = Array.isArray(work.directors) ? work.directors : [];
  const seasons = Array.isArray(work.seasons) ? work.seasons : [];
  const result = {
    id: work.id,
    overview: work.overview || '',
    poster_path: work.posterPath || null,
    backdrop_path: work.backdropPath || null,
    genres: Array.isArray(work.genres) ? work.genres : [],
    vote_average: work.voteAverage ?? null,
    vote_count: work.voteCount ?? null,
    credits: {
      cast: cast.map(p => ({
        id: p.id, name: p.name,
        character: p.character || '',
        profile_path: p.profilePath || null
      })),
      crew: directors.map(p => ({id:p.id,name:p.name,job:'Director'}))
    }
  };
  if (tv) {
    return {
      ...result,
      name: work.title,
      original_name: work.originalTitle || work.title,
      first_air_date: work.releaseDate || '',
      episode_run_time: work.runtimeMinutes == null ? [] : [work.runtimeMinutes],
      seasons: seasons.map(s => ({
        id:s.id,season_number:s.seasonNumber,name:s.name,
        episode_count:s.episodeCount,air_date:s.airDate,
        poster_path:s.posterPath
      })),
      status: work.status || null
    };
  }
  return {
    ...result,
    title: work.title,
    original_title: work.originalTitle || work.title,
    release_date: work.releaseDate || '',
    runtime: work.runtimeMinutes ?? null,
    belongs_to_collection: work.collectionId
      ? {id:work.collectionId,name:work.collectionName || ''}
      : null
  };
}
module.exports={workToDetail};
