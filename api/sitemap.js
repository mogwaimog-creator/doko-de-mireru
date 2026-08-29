// =========================================================
// doko-de-mireru
// api/sitemap.js
//
// 作品ページ用サイトマップ生成API
//
// TMDBの日本向け人気映画を取得し、
// detail.html?id=作品ID のURLを生成する。
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
    // 基本URL
    // =====================================================

    const siteUrl =
      "https://doko-de-mireru.vercel.app";


    // =====================================================
    // TMDBから取得するページ数
    //
    // 1ページ = 最大20作品
    //
    // 5ページ取得すると最大100作品
    // =====================================================

    const pages =
      5;


    const moviesMap =
      new Map();


    // =====================================================
    // TMDBから映画を取得
    // =====================================================

    for (
      let page = 1;
      page <= pages;
      page++
    ) {

      const url =
        "https://api.themoviedb.org/3/movie/popular" +
        "?api_key=" +
        encodeURIComponent(apiKey) +
        "&language=ja-JP" +
        "&region=JP" +
        "&page=" +
        page;


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


      movies.forEach(function(movie) {

        if (
          !movie ||
          !movie.id ||
          !movie.title
        ) {

          return;

        }


        /*
           同じ作品が複数ページに存在する場合は
           重複登録しない。
        */

        if (
          !moviesMap.has(
            String(movie.id)
          )
        ) {

          moviesMap.set(
            String(movie.id),
            movie
          );

        }

      });

    }


    // =====================================================
    // 取得作品
    // =====================================================

    const movies =
      Array.from(
        moviesMap.values()
      );


    // =====================================================
    // サイトマップURL
    // =====================================================

    const urls = [];


    // =====================================================
    // トップページ
    // =====================================================

    urls.push({
      loc:
        siteUrl + "/",

      changefreq:
        "daily",

      priority:
        "1.0"
    });


    // =====================================================
    // 作品ページ
    // =====================================================

    movies.forEach(function(movie) {

      const detailUrl =
        siteUrl +
        "/detail.html?id=" +
        encodeURIComponent(
          movie.id
        );


      /*
         TMDBの公開日がある場合は
         lastmodとして利用。
      */

      let lastmod =
        "";


      if (movie.release_date) {

        const date =
          String(
            movie.release_date
          ).trim();


        /*
           YYYY-MM-DD形式だけ採用
        */

        if (
          /^\d{4}-\d{2}-\d{2}$/.test(
            date
          )
        ) {

          lastmod =
            date;

        }

      }


      urls.push({
        loc:
          detailUrl,

        lastmod:
          lastmod,

        changefreq:
          "weekly",

        priority:
          "0.8"
      });

    });


    // =====================================================
    // XMLエスケープ
    // =====================================================

    function escapeXml(value) {

      return String(
        value || ""
      )
      .replace(
        /&/g,
        "&amp;"
      )
      .replace(
        /</g,
        "&lt;"
      )
      .replace(
        />/g,
        "&gt;"
      )
      .replace(
        /"/g,
        "&quot;"
      )
      .replace(
        /'/g,
        "&apos;"
      );

    }


    // =====================================================
    // XML生成
    // =====================================================

    const xmlUrls =
      urls.map(function(item) {

        let xml =
          "  <url>\n" +
          "    <loc>" +
          escapeXml(
            item.loc
          ) +
          "</loc>\n";


        if (item.lastmod) {

          xml +=
            "    <lastmod>" +
            escapeXml(
              item.lastmod
            ) +
            "</lastmod>\n";

        }


        xml +=
          "    <changefreq>" +
          escapeXml(
            item.changefreq
          ) +
          "</changefreq>\n" +

          "    <priority>" +
          escapeXml(
            item.priority
          ) +
          "</priority>\n" +

          "  </url>";


        return xml;

      }).join("\n");


    // =====================================================
    // 完成XML
    // =====================================================

    const xml =
`<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${xmlUrls}
</urlset>`;


    // =====================================================
    // HTTPヘッダー
    // =====================================================

    res.setHeader(
      "Content-Type",
      "application/xml; charset=utf-8"
    );


    /*
       24時間キャッシュ

       同じ内容を毎回TMDBへ問い合わせないようにする。
    */

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


    return res
      .status(500)
      .send(
        "サイトマップを生成できませんでした。"
      );

  }

};
