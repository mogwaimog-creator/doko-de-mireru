export default async function handler(req, res) {
  try {
    const query = req.query.query;
    const movieId = req.query.id;

    if (!query && !movieId) {
      return res.status(400).json({
        error: "映画名または作品IDが必要です"
      });
    }

    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "TMDB APIキーが設定されていません"
      });
    }

    let movie;

    if (movieId) {
      const movieUrl =
        "https://api.themoviedb.org/3/movie/" +
        movieId +
        "?api_key=" + apiKey +
        "&language=ja-JP";

      const movieResponse = await fetch(movieUrl);
      const movieData = await movieResponse.json();

      if (!movieData.id) {
        return res.status(404).json({
          error: "映画が見つかりませんでした"
        });
      }

      movie = movieData;

    } else {
      const searchUrl =
        "https://api.themoviedb.org/3/search/movie" +
        "?api_key=" + apiKey +
        "&language=ja-JP" +
        "&query=" + encodeURIComponent(query) +
        "&region=JP";

      const searchResponse = await fetch(searchUrl);
      const searchData = await searchResponse.json();

      if (!searchData.results || searchData.results.length === 0) {
        return res.status(404).json({
          error: "映画が見つかりませんでした"
        });
      }

      movie = searchData.results[0];
    }

    const providersUrl =
      "https://api.themoviedb.org/3/movie/" +
      movie.id +
      "/watch/providers" +
      "?api_key=" + apiKey;

    const providersResponse = await fetch(providersUrl);
    const providersData = await providersResponse.json();

    const japan =
      providersData.results &&
      providersData.results.JP
        ? providersData.results.JP
        : {};

    const detailUrl =
      "https://api.themoviedb.org/3/movie/" +
      movie.id +
      "?api_key=" + apiKey +
      "&language=ja-JP";

    const detailResponse = await fetch(detailUrl);
    const detailData = await detailResponse.json();

    let collection = null;
    let seriesMovies = [];

    if (detailData.belongs_to_collection) {
      collection = detailData.belongs_to_collection;

      const collectionUrl =
        "https://api.themoviedb.org/3/collection/" +
        collection.id +
        "?api_key=" + apiKey +
        "&language=ja-JP";

      const collectionResponse = await fetch(collectionUrl);
      const collectionData = await collectionResponse.json();

      if (
        collectionData.parts &&
        collectionData.parts.length
      ) {
        seriesMovies = collectionData.parts
          .sort(function(a, b) {
            const dateA =
              a.release_date || "9999-99-99";

            const dateB =
              b.release_date || "9999-99-99";

            return dateA.localeCompare(dateB);
          })
          .map(function(item) {
            return {
              id: item.id,
              title: item.title,
              release_date: item.release_date,
              poster_path: item.poster_path
            };
          });
      }
    }

    return res.status(200).json({
      id: movie.id,
      title: movie.title,
      original_title: movie.original_title,
      release_date: movie.release_date,
      overview: movie.overview,
      poster_path: movie.poster_path,

      streaming: japan.flatrate || [],
      rental: japan.rent || [],
      purchase: japan.buy || [],

      link: japan.link || null,

      series: collection
        ? {
            id: collection.id,
            name: collection.name,
            movies: seriesMovies
          }
        : null
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "検索中にエラーが発生しました"
    });
  }
}
