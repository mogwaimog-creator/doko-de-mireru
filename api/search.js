export default async function handler(req, res) {
  try {
    const query = req.query.query;

    if (!query) {
      return res.status(400).json({
        error: "映画名を入力してください"
      });
    }

    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "TMDB APIキーが設定されていません"
      });
    }

    const searchUrl =
      `https://api.themoviedb.org/3/search/movie` +
      `?api_key=${apiKey}` +
      `&language=ja-JP` +
      `&query=${encodeURIComponent(query)}` +
      `&region=JP`;

    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();

    if (!searchData.results || searchData.results.length === 0) {
      return res.status(404).json({
        error: "映画が見つかりませんでした"
      });
    }

    const movie = searchData.results[0];

    const providersUrl =
      `https://api.themoviedb.org/3/movie/${movie.id}/watch/providers` +
      `?api_key=${apiKey}`;

    const providersResponse = await fetch(providersUrl);
    const providersData = await providersResponse.json();

    const japan =
      providersData.results && providersData.results.JP
        ? providersData.results.JP
        : {};

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
      link: japan.link || null
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "検索中にエラーが発生しました"
    });
  }
}
