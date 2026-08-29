// =========================================================
// doko-de-mireru
// api/sitemap.js
//
// 作品ページ用サイトマップ生成API
// TMDBから複数ページの人気作品を取得
// =========================================================

module.exports = async function handler(req, res) {

  try {

    const apiKey =
      process.env.TMDB_API_KEY;


    // =====================================================
    // APIキー確認
    // =====================================================

    if (!apiKey) {

      return res.status(500).send(
        "TMDB_API_KEY が設定されていません。"
      );

    }


    // =====================================================
    // 設定
    //
    // 1ページ = 最大20作品
    // 20ページ = 最大400作品
    // =====================================================

    const MAX_PAGES = 20;


    const baseUrl =
      "https://api.themoviedb.org/3/movie/popular";


    // =====================================================
    // TMDBから複数ページ取得
    // =====================================================

    const requests = [];


    for (
      let page = 1;
      page <= MAX_PAGES;
      page++
    ) {

      const url =
        baseUrl +
        "?api_key=" +
        encodeURIComponent(apiKey) +
        "&language=ja-JP" +
        "&region=JP" +
        "&page=" +
        page;


      requests.push(
        fetch(url)
      );

    }


    const responses =
      await Promise.all(requests);


    // =====================================================
    // APIエラー確認
    // =====================================================

    for (const response of responses) {

      if (!response.ok) {

        throw new Error(
          "TMDB API ERROR: " +
          response.status
        );

      }

    }


    // =====================================================
    // JSON取得
    // =====================================================

    const datasets =
      await Promise.all(
        responses.map(function(response) {

          return response.json();

        })
      );


    // =====================================================
    // 作品一覧
    // =====================================================

    const movies = [];


    datasets.forEach(function(data) {

      if (
        data &&
        Array.isArray(data.results)
      ) {

        data.results.forEach(function(movie) {

          if (
            movie &&
            movie.id &&
            movie.title
          ) {

            movies.push(movie);

          }

        });

      }

    });


    // =====================================================
    // 重複削除
    // =====================================================

    const seen =
      new Set();


    const uniqueMovies =
      movies.filter(function(movie) {

        const movieId =
          String(movie.id);


        if (seen.has(movieId)) {

          return false;

        }


        seen.add(movieId);


        return true;

      });


    // =====================================================
    // URL一覧
    // =====================================================

    const urls = [];


    // =====================================================
    // トップページ
    // =====================================================

    urls.push(`
  <url>
    <loc>https://doko-de-mireru.vercel.app/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`);


    // =====================================================
    // 作品詳細ページ
    // =====================================================

    uniqueMovies.forEach(function(movie) {

      const movieId =
        String(movie.id);


      const detailUrl =
        "https://doko-de-mireru.vercel.app/detail.html?id=" +
        encodeURIComponent(movieId);


      urls.push(`
  <url>
    <loc>${detailUrl}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);

    });


    // =====================================================
    // XML生成
    // =====================================================

    const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;


    // =====================================================
    // HTTPヘッダー
    // =====================================================

    res.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );


    // 24時間キャッシュ
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=3600"
    );


    // =====================================================
    // 完了
    // =====================================================

    return res
      .status(200)
      .send(xml);


  } catch (error) {

    console.error(
      "SITEMAP ERROR:",
      error
    );


    return res.status(500).send(
      "サイトマップを生成できませんでした。"
    );

  }

};
