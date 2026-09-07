// =========================================================
// doko-de-mireru
// api/sitemap.js
//
// 作品ページ用サイトマップ生成API
//
// ・人気映画
// ・劇場版アニメ
// ・ドラマ
// ・TVアニメ
//
// ＋
//
// ・名探偵コナン
// ・ドラえもん
// ・クレヨンしんちゃん
// ・ONE PIECE
// ・ポケモン
//
// など、日本で検索されやすい重要シリーズを補強
//
// TMDBから複数ページ取得
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
    // ここに重要作品を追加する
    // =====================================================

    const MAX_PAGES = 20;


    // =====================================================
    // TMDB JSON取得
    // =====================================================

    async function fetchJson(url) {

      const response =
        await fetch(url);


      if (!response.ok) {

        throw new Error(
          "TMDB API ERROR: " +
          response.status
        );

      }


      return response.json();

    }


    // =====================================================
    // TMDB人気作品取得
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
          fetchJson(url)
        );

      }


      const datasets =
        await Promise.all(requests);


      const items = [];


      datasets.forEach(function(data) {

        if (
          !data ||
          !Array.isArray(data.results)
        ) {

          return;

        }


        data.results.forEach(function(item) {

          if (
            item &&
            item.id
          ) {

            items.push({

              id:
                item.id,

              mediaType:
                mediaType,

              important:
                false

            });

          }

        });

      });


      return items;

    }


    // =====================================================
    // タイトル正規化
    //
    // ・空白
    // ・記号
    // ・ひらがな / カタカナ
    //
    // の差を少なくする
    // =====================================================

    function normalizeTitle(value) {

      let text =
        String(value || "");


      try {

        text =
          text.normalize("NFKC");

      } catch (error) {

        // normalize非対応環境ではそのまま

      }


      text =
        text
          .toLowerCase()
          .replace(
            /[\s　]/g,
            ""
          )
          .replace(
            /[「」『』【】〔〕［］\[\]（）()〈〉《》＜＞<>・･:：;；!?！？,.，。、'"“”‘’`´\-‐-‒–—―~〜～／\/\\]/g,
            ""
          );


      // ひらがな → カタカナ

      text =
        text.replace(
          /[\u3041-\u3096]/g,
          function(char) {

            return String.fromCharCode(
              char.charCodeAt(0) +
              0x60
            );

          }
        );


      return text;

    }


    // =====================================================
    // 重要映画シリーズ検索
    //
    // 人気400作品から漏れている劇場版を補う
    // =====================================================

    async function fetchImportantMovies() {

      const seriesList = [

        // =================================================
        // 日本アニメ
        // =================================================

        {
          queries: [
            "名探偵コナン",
            "Detective Conan"
          ],

          keywords: [
            "名探偵コナン",
            "detectiveconan"
          ]
        },

        {
          queries: [
            "ドラえもん",
            "Doraemon"
          ],

          keywords: [
            "ドラえもん",
            "doraemon"
          ]
        },

        {
          queries: [
            "クレヨンしんちゃん",
            "Crayon Shin-chan"
          ],

          keywords: [
            "クレヨンしんちゃん",
            "crayonshinchan"
          ]
        },

        {
          queries: [
            "ONE PIECE",
            "ワンピース"
          ],

          keywords: [
            "onepiece",
            "ワンピース"
          ]
        },

        {
          queries: [
            "ポケットモンスター",
            "Pokémon"
          ],

          keywords: [
            "ポケットモンスター",
            "pokemon",
            "pokémon"
          ]
        }

      ];


      const importantMovies = [];


      for (
        const series of seriesList
      ) {

        for (
          const query of series.queries
        ) {

          // -----------------------------------------------
          // 3ページまで取得
          //
          // 古い劇場版まで拾いやすくする
          // -----------------------------------------------

          for (
            let page = 1;
            page <= 3;
            page++
          ) {

            try {

              const url =
                "https://api.themoviedb.org/3/search/movie" +
                "?api_key=" +
                encodeURIComponent(apiKey) +
                "&language=ja-JP" +
                "&region=JP" +
                "&include_adult=false" +
                "&page=" +
                page +
                "&query=" +
                encodeURIComponent(query);


              const data =
                await fetchJson(url);


              if (
                !data ||
                !Array.isArray(data.results)
              ) {

                continue;

              }


              data.results.forEach(function(movie) {

                if (
                  !movie ||
                  !movie.id
                ) {

                  return;

                }


                const title =
                  normalizeTitle(
                    movie.title || ""
                  );


                const originalTitle =
                  normalizeTitle(
                    movie.original_title || ""
                  );


                const matches =
                  series.keywords.some(
                    function(keyword) {

                      const normalizedKeyword =
                        normalizeTitle(keyword);


                      return (
                        title.includes(
                          normalizedKeyword
                        ) ||
                        originalTitle.includes(
                          normalizedKeyword
                        )
                      );

                    }
                  );


                if (!matches) {

                  return;

                }


                importantMovies.push({

                  id:
                    movie.id,

                  mediaType:
                    "movie",

                  important:
                    true

                });

              });


              // 次ページが無ければ終了

              if (
                Number(data.page || page) >=
                Number(data.total_pages || page)
              ) {

                break;

              }

            } catch (error) {

              console.error(
                "IMPORTANT MOVIE SEARCH ERROR:",
                query,
                error
              );

            }

          }

        }

      }


      return importantMovies;

    }


    // =====================================================
    // 重要TV作品
    //
    // TVアニメ本編もサイトマップに確実に入れる
    // =====================================================

    async function fetchImportantTvShows() {

      const queries = [

        "名探偵コナン",
        "ドラえもん",
        "クレヨンしんちゃん",
        "ONE PIECE",
        "ポケットモンスター"

      ];


      const items = [];


      for (
        const query of queries
      ) {

        try {

          const url =
            "https://api.themoviedb.org/3/search/tv" +
            "?api_key=" +
            encodeURIComponent(apiKey) +
            "&language=ja-JP" +
            "&include_adult=false" +
            "&page=1" +
            "&query=" +
            encodeURIComponent(query);


          const data =
            await fetchJson(url);


          if (
            !data ||
            !Array.isArray(data.results)
          ) {

            continue;

          }


          const normalizedQuery =
            normalizeTitle(query);


          // -----------------------------------------------
          // タイトルが近いものだけ追加
          // -----------------------------------------------

          data.results.forEach(function(show) {

            if (
              !show ||
              !show.id
            ) {

              return;

            }


            const title =
              normalizeTitle(
                show.name || ""
              );


            const originalTitle =
              normalizeTitle(
                show.original_name || ""
              );


            if (
              !title.includes(
                normalizedQuery
              ) &&
              !originalTitle.includes(
                normalizedQuery
              )
            ) {

              return;

            }


            items.push({

              id:
                show.id,

              mediaType:
                "tv",

              important:
                true

            });

          });

        } catch (error) {

          console.error(
            "IMPORTANT TV SEARCH ERROR:",
            query,
            error
          );

        }

      }


      return items;

    }


    // =====================================================
    // 映画
    // =====================================================

    const movies =
      await fetchPopular(
        "movie"
      );


    // =====================================================
    // TV
    // =====================================================

    const tvShows =
      await fetchPopular(
        "tv"
      );


    // =====================================================
    // 重要作品
    // =====================================================

    const importantMovies =
      await fetchImportantMovies();


    const importantTvShows =
      await fetchImportantTvShows();


    // =====================================================
    // 全作品
    // =====================================================

    const allItems =
      []
        .concat(
          movies
        )
        .concat(
          tvShows
        )
        .concat(
          importantMovies
        )
        .concat(
          importantTvShows
        );


    // =====================================================
    // 重複削除
    //
    // movie:123
    // tv:123
    //
    // は別ページ
    //
    // 重要作品が重複した場合は
    // important = true を残す
    // =====================================================

    const itemMap =
      new Map();


    allItems.forEach(function(item) {

      if (
        !item ||
        !item.id ||
        !item.mediaType
      ) {

        return;

      }


      const key =
        item.mediaType +
        ":" +
        String(item.id);


      if (
        !itemMap.has(key)
      ) {

        itemMap.set(
          key,
          item
        );

        return;

      }


      // 重要作品フラグを優先

      const existing =
        itemMap.get(key);


      if (
        item.important &&
        !existing.important
      ) {

        itemMap.set(
          key,
          item
        );

      }

    });


    const uniqueItems =
      Array.from(
        itemMap.values()
      );


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
      // TV
      // ===================================================

      if (
        item.mediaType === "tv"
      ) {

        detailUrl +=
          "&amp;type=tv";

      }


      // ===================================================
      // priority
      //
      // 重要作品 0.9
      // 通常作品 0.8
      //
      // ※ 検索順位を直接上げるものではないが
      //    サイトマップ上で整理するため
      // ===================================================

      const priority =
        item.important
          ? "0.9"
          : "0.8";


      urls.push(`
  <url>
    <loc>${detailUrl}</loc>
    <changefreq>weekly</changefreq>
    <priority>${priority}</priority>
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
