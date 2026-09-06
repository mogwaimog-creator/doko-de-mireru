// =========================================================
// doko-de-mireru
// api/sitemap.js
//
// 作品ページ用サイトマップ生成API
//
// ・映画
// ・劇場版アニメ
// ・ドラマ
// ・TVアニメ
//
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
    // movie 20ページ = 最大400作品
    // tv    20ページ = 最大400作品
    //
    // 合計 最大約800作品
    // =====================================================

    const MAX_PAGES = 20;


    // =====================================================
    // TMDBから人気作品を取得する関数
    // =====================================================

    async function fetchPopular(mediaType) {

      const baseUrl =
        "https://api.themoviedb.org/3/" +
        mediaType +
        "/popular";


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


      // ===================================================
      // APIエラー確認
      // ===================================================

      for (const response of responses) {

        if (!response.ok) {

          throw new Error(
            "TMDB API ERROR: " +
            response.status
          );

        }

      }


      // ===================================================
      // JSON取得
      // ===================================================

      const datasets =
        await Promise.all(
          responses.map(function(response) {

            return response.json();

          })
        );


      // ===================================================
      // 作品一覧
      // ===================================================

      const items = [];


      datasets.forEach(function(data) {

        if (
          data &&
          Array.isArray(data.results)
        ) {

          data.results.forEach(function(item) {

            if (
              item &&
              item.id
            ) {

              items.push({

                id:
                  item.id,

                mediaType:
                  mediaType

              });

            }

          });

        }

      });


      return items;

    }


    // =====================================================
    // 映画
    //
    // ・映画
    // ・劇場版アニメ
    // =====================================================

    const movies =
      await fetchPopular(
        "movie"
      );


    // =====================================================
    // TV
    //
    // ・ドラマ
    // ・TVアニメ
    // =====================================================

    const tvShows =
      await fetchPopular(
        "tv"
      );


    // =====================================================
    // 映画 + TV
    // =====================================================

    const allItems =
      []
        .concat(movies)
        .concat(tvShows);


    // =====================================================
    // 重複削除
    //
    // movie:123
    // tv:123
    //
    // は別作品として扱う
    // =====================================================

    const seen =
      new Set();


    const uniqueItems =
      allItems.filter(function(item) {

        const key =
          item.mediaType +
          ":" +
          String(item.id);


        if (
          seen.has(key)
        ) {

          return false;

        }


        seen.add(key);


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

    uniqueItems.forEach(function(item) {

      const itemId =
        String(item.id);


      let detailUrl =
        "https://doko-de-mireru.vercel.app/detail.html?id=" +
        encodeURIComponent(itemId);


      // ===================================================
      // ドラマ・TVアニメ
      //
      // XML内では
      //
      // &
      //
      // を
      //
      // &amp;
      //
      // と書く必要がある
      // ===================================================

      if (
        item.mediaType === "tv"
      ) {

        detailUrl +=
          "&amp;type=tv";

      }


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
