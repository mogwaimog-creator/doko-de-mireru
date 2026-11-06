'use strict';
// Pure adapter: reconstruct the TMDB-shaped fixed metadata consumed by legacy
// detail rendering, without persisting another copy in Redis.
// This does not decide whether a record is verified or safe to migrate.
function workToLegacyDetail(work) {
  if (!work || !['movie','tv'].includes(work.type) ||
      !Number.isSafeInteger(Number(work.id)) || Number(work.id)<=0 || !work.title) {
    throw new Error('Invalid compact work record');
  }
  const tv = work.type === 'tv';
  const cast = Array.isArray(work.cast) ? work.cast : [];
  const directors = Array.isArray(work.directors) ? work.directors : [];
  const credits = {
    cast: cast.map(p => ({
      id: p.id, name: p.name,
      character: p.character ?? null,
      profile_path: p.profilePath ?? p.profile_path ?? null
    })),
    crew: directors.map(p => ({id:p.id,name:p.name,job:'Director'}))
  };
  const base = {
    id: Number(work.id),
    overview: work.overview ?? '',
    poster_path: work.posterPath ?? null,
    backdrop_path: work.backdropPath ?? null,
    genres: Array.isArray(work.genres) ? work.genres : [],
    vote_average: work.voteAverage ?? 0,
    vote_count: work.voteCount ?? 0,
    credits
  };
  if (tv) {
    return {
      ...base,
      name: work.title,
      original_name: work.originalTitle ?? work.title,
      first_air_date: work.releaseDate ?? '',
      episode_run_time: work.runtimeMinutes == null ? [] : [work.runtimeMinutes],
      status: work.status ?? null,
      seasons: (Array.isArray(work.seasons) ? work.seasons : []).map(s => ({
        id:s.id, season_number:s.seasonNumber ?? s.season_number,
        name:s.name, episode_count:s.episodeCount ?? s.episode_count,
        air_date:s.airDate ?? s.air_date,
        poster_path:s.posterPath ?? s.poster_path
      }))
    };
  }
  return {
    ...base,
    title: work.title,
    original_title: work.originalTitle ?? work.title,
    release_date: work.releaseDate ?? '',
    runtime: work.runtimeMinutes ?? null,
    belongs_to_collection: work.collectionId == null ? null : {
      id: work.collectionId, name: work.collectionName ?? ''
    }
  };
}
module.exports = {workToLegacyDetail};
