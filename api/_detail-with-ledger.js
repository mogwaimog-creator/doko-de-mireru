'use strict';

// Opt-in integration for existing /api/search detail responses.
// Cache stores a reusable subset of TMDB detail, never watch/providers.
// Disabled by default until reviewed on a preview deployment.
const { getWork, putWork } = require('./_work-ledger');
const { fromTmdb } = require('./_work-from-tmdb');

function restore(type, work) {
  const tv = type === 'tv';
  const credits = {
    cast: (work.cast || []).map(p => ({
      id: p.id, name: p.name, character: p.character,
      profile_path: p.profilePath
    })),
    crew: (work.directors || []).map(p => ({
      id: p.id, name: p.name, job: 'Director'
    }))
  };
  return {
    id: work.id,
    title: tv ? undefined : work.title,
    name: tv ? work.title : undefined,
    original_title: tv ? undefined : work.originalTitle,
    original_name: tv ? work.originalTitle : undefined,
    release_date: tv ? undefined : work.releaseDate,
    first_air_date: tv ? work.releaseDate : undefined,
    overview: work.overview || '',
    runtime: tv ? undefined : work.runtimeMinutes,
    episode_run_time: tv ? [work.runtimeMinutes].filter(Number.isFinite) : undefined,
    genres: work.genres || [],
    poster_path: work.posterPath,
    backdrop_path: work.backdropPath,
    credits,
    belongs_to_collection: !tv && work.collectionId
      ? { id: work.collectionId, name: work.collectionName } : null,
    seasons: tv ? (work.seasons || []).map(s => ({
      id: s.id, season_number: s.seasonNumber, name: s.name,
      episode_count: s.episodeCount, air_date: s.airDate, poster_path: s.posterPath
    })) : undefined,
    status: work.status,
    vote_average: work.voteAverage,
    vote_count: work.voteCount
  };
}

async function detailWithLedger(type, id, load) {
  if (process.env.WORK_LEDGER_ENABLED !== '1') return load();
  try {
    const cached = await getWork(type, id);
    if (cached && cached.title && cached.id === Number(id) && cached.type === type) {
      return restore(type, cached);
    }
  } catch (error) {
    console.error('WORK LEDGER READ FAILED', error);
  }

  const original = await load();
  if (!original || Number(original.id) !== Number(id)) return original;
  try {
    await putWork(type, id, fromTmdb(type, original));
  } catch (error) {
    console.error('WORK LEDGER WRITE FAILED', error);
  }
  return original;
}

module.exports = { detailWithLedger, restore };
