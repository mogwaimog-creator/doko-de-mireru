// =========================================================
// doko-de-mireru
// api/sitemap.js
//
// 作品ページ用サイトマップ生成API
// =========================================================

module.exports = async function handler(req, res) {

  try {

    const apiKey =
      process.env.TMDB_API_KEY;


    if (!apiKey) {

      return res.status(500).send(
        "TMDB_API_KEY が設定されていません。"
      );

    }


    // =====================================================
    // TMDBから人気作品を取得
    // =====================================================

    const url =
      "https://api.themoviedb.org/3/movie/popular" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&region=JP" +
      "&page=1";


    const response =
      await fetch(url);


    if (!response.ok) {

      throw new Error(
        "TMDB API ERROR: " +
        response.status
      );

    }


    const data =
      await response.json();


    const movies =
      Array.isArray(data.results)
        ? data.results
        : [];


    // =====================================================
    // サイトマップ生成
    // =====================================================

    const urls = [];


    // トップページ

    urls.push(`
  <url>
    <loc>https://doko-de-mireru.vercel.app/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`);


    // 作品ページ

    movies
      .filter(function(movie) {

        return (
          movie &&
          movie.id &&
          movie.title
        );

      })
      .forEach(function(movie) {

        urls.push(`
  <url>
    <loc>https://doko-de-mireru.vercel.app/detail.html?id=${encodeURIComponent(movie.id)}</loc>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);

      });


    // =====================================================
    // XML
    // =====================================================

    const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;


    res.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );


    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=3600"
    );


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
