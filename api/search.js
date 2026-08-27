export default async function handler(req, res) {

  /*
   * =========================================
   * 基本設定
   * =========================================
   */

  const CACHE_SECONDS = 60 * 60 * 24;

  const TMDB_IMAGE_BASE =
    "https://image.tmdb.org/t/p/w500";


  try {

    /*
     * =========================================
     * APIキー確認
     * =========================================
     */

    const apiKey =
      process.env.TMDB_API_KEY;

    if (!apiKey) {

      return res.status(500).json({

        error:
          "TMDB APIキーが設定されていません"

      });

    }


    /*
     * =========================================
     * キャッシュ
     * =========================================
     */

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=3600"
    );


    /*
     * =========================================
     * 作品IDがある場合
     * → 作品詳細
     * =========================================
     */

    const movieId =
      req.query.id;

    if (movieId) {

      return await getMovieDetail(
        movieId,
        apiKey,
        res
      );

    }


    /*
     * =========================================
     * 映画名検索
     * =========================================
     */

    const query =
      req.query.query;


    if (!query) {

      return res.status(400).json({

        error:
          "映画名を入力してください"

      });

    }


    /*
     * =========================================
     * TMDB映画検索
     * =========================================
     */

    const searchUrl =
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&query=" +
      encodeURIComponent(query) +
      "&region=JP" +
      "&include_adult=false";


    const searchResponse =
      await fetch(searchUrl);


    if (!searchResponse.ok) {

      throw new Error(
        "TMDB検索に失敗しました"
      );

    }


    const searchData =
      await searchResponse.json();


    if (
      !searchData.results ||
      searchData.results.length === 0
    ) {

      return res.status(404).json({

        error:
          "映画が見つかりませんでした"

      });

    }


    /*
     * =========================================
     * 最大10作品
     * =========================================
     */

    const rawMovies =
      searchData.results
        .slice(0, 10);


    /*
     * =========================================
     * シリーズ情報確認
     * =========================================
     */

    const moviesWithSeries =
      await Promise.all(

        rawMovies.map(
          async function(movie) {

            let collection = null;


            try {

              const detailUrl =
                "https://api.themoviedb.org/3/movie/" +
                movie.id +
                "?api_key=" +
                encodeURIComponent(apiKey) +
                "&language=ja-JP";


              const detailResponse =
                await fetch(detailUrl);


              if (detailResponse.ok) {

                const detailData =
                  await detailResponse.json();


                collection =
                  detailData.belongs_to_collection ||
                  null;

              }

            }

            catch (error) {

              console.error(
                "シリーズ確認エラー:",
                error
              );

            }


            return {

              id:
                movie.id,

              title:
                movie.title,

              original_title:
                movie.original_title,

              release_date:
                movie.release_date,

              overview:
                movie.overview,

              poster_path:
                movie.poster_path,

              vote_average:
                movie.vote_average,

              collection:
                collection

            };

          }
        )

      );


    /*
     * =========================================
     * シリーズ作品と通常作品を分ける
     * =========================================
     */

    const seriesGroups = {};

    const normalMovies = [];


    moviesWithSeries.forEach(
      function(movie) {

        /*
         * Untitled作品を除外
         */

        if (
          !movie.title ||
          movie.title
            .toLowerCase()
            .includes("untitled")
        ) {

          return;

        }


        if (movie.collection) {

          const collectionId =
            movie.collection.id;


          if (!seriesGroups[collectionId]) {

            seriesGroups[collectionId] = [];

          }


          seriesGroups[collectionId].push(
            movie
          );

        }

        else {

          normalMovies.push(
            movie
          );

        }

      }
    );


    /*
     * =========================================
     * シリーズ作品を公開順にする
     * =========================================
     */

    let sortedSeriesMovies = [];


    Object.keys(seriesGroups).forEach(
      function(collectionId) {

        const group =
          seriesGroups[collectionId];


        group.sort(
          function(a, b) {

            const dateA =
              a.release_date ||
              "9999-99-99";


            const dateB =
              b.release_date ||
              "9999-99-99";


            return dateA.localeCompare(
              dateB
            );

          }
        );


        sortedSeriesMovies =
          sortedSeriesMovies.concat(
            group
          );

      }
    );


    /*
     * =========================================
     * 最終検索結果
     * =========================================
     */

    const movies =
      sortedSeriesMovies
        .concat(normalMovies)
        .slice(0, 10)
        .map(
          function(movie) {

            return {

              id:
                movie.id,

              title:
                movie.title,

              original_title:
                movie.original_title,

              release_date:
                movie.release_date,

              vote_average:
                movie.vote_average,

              overview:
                movie.overview,

              poster_path:
                movie.poster_path

            };

          }
        );


    /*
     * =========================================
     * 検索結果を返す
     * =========================================
     */

    return res.status(200).json({

      results:
        movies

    });


  }

  catch (error) {

    console.error(
      "検索エラー:",
      error
    );


    return res.status(500).json({

      error:
        "検索中にエラーが発生しました"

    });

  }

}


/*
 * =========================================
 * 作品詳細
 * =========================================
 */

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

  /*
   * =========================================
   * 作品情報
   * creditsを同時取得
   * =========================================
   */

  const detailUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&append_to_response=credits";


  const detailResponse =
    await fetch(detailUrl);


  if (!detailResponse.ok) {

    return res.status(404).json({

      error:
        "作品情報を取得できませんでした"

    });

  }


  const detailData =
    await detailResponse.json();


  if (
    !detailData ||
    !detailData.id
  ) {

    return res.status(404).json({

      error:
        "作品が見つかりませんでした"

    });

  }


  /*
   * =========================================
   * 日本の配信情報
   *
   * TMDB Watch Providers
   * =========================================
   */

  const providersUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "/watch/providers" +
    "?api_key=" +
    encodeURIComponent(apiKey);


  const providersResponse =
    await fetch(providersUrl);


  let providersData = {};


  if (providersResponse.ok) {

    providersData =
      await providersResponse.json();

  }


  /*
   * =========================================
   * 日本 JP の配信情報
   * =========================================
   */

  const japan =
    providersData.results &&
    providersData.results.JP
      ? providersData.results.JP
      : {};


  /*
   * =========================================
   * 配信サービス整理
   *
   * linkも保持する
   * =========================================
   */

  const streaming =
    normalizeProviders(
      japan.flatrate || [],
      japan.link || null
    );


  const rental =
    normalizeProviders(
      japan.rent || [],
      japan.link || null
    );


  const purchase =
    normalizeProviders(
      japan.buy || [],
      japan.link || null
    );


  /*
   * =========================================
   * シリーズ情報
   * =========================================
   */

  let collection = null;

  let seriesMovies = [];


  if (detailData.belongs_to_collection) {

    collection =
      detailData.belongs_to_collection;


    const collectionUrl =
      "https://api.themoviedb.org/3/collection/" +
      encodeURIComponent(collection.id) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP";


    const collectionResponse =
      await fetch(collectionUrl);


    if (collectionResponse.ok) {

      const collectionData =
        await collectionResponse.json();


      if (
        collectionData.parts &&
        collectionData.parts.length
      ) {

        seriesMovies =
          collectionData.parts

            /*
             * Untitled作品を除外
             */

            .filter(
              function(item) {

                if (!item.title) {

                  return false;

                }


                return !item.title
                  .toLowerCase()
                  .includes("untitled");

              }
            )

            /*
             * 公開順
             */

            .sort(
              function(a, b) {

                const dateA =
                  a.release_date ||
                  "9999-99-99";


                const dateB =
                  b.release_date ||
                  "9999-99-99";


                return dateA.localeCompare(
                  dateB
                );

              }
            )

            /*
             * 必要な情報だけ返す
             */

            .map(
              function(item) {

                return {

                  id:
                    item.id,

                  title:
                    item.title,

                  release_date:
                    item.release_date,

                  poster_path:
                    item.poster_path

                };

              }
            );

      }

    }

  }


  /*
   * =========================================
   * 監督
   * =========================================
   */

  let director = null;


  if (
    detailData.credits &&
    detailData.credits.crew
  ) {

    director =
      detailData.credits.crew.find(
        function(person) {

          return (
            person.job ===
            "Director"
          );

        }
      ) || null;

  }


  /*
   * =========================================
   * 出演者
   * 最大8人
   * =========================================
   */

  let cast = [];


  if (
    detailData.credits &&
    detailData.credits.cast
  ) {

    cast =
      detailData.credits.cast
        .slice(0, 8)
        .map(
          function(person) {

            return {

              name:
                person.name,

              character:
                person.character

            };

          }
        );

  }


  /*
   * =========================================
   * 配信情報の更新時刻
   * =========================================
   */

  const updatedAt =
    new Date().toISOString();


  /*
   * =========================================
   * 詳細情報を返す
   * =========================================
   */

  return res.status(200).json({

    /*
     * 基本情報
     */

    id:
      detailData.id,

    title:
      detailData.title,

    original_title:
      detailData.original_title,

    release_date:
      detailData.release_date,

    overview:
      detailData.overview,

    poster_path:
      detailData.poster_path,


    /*
     * 評価
     */

    vote_average:
      detailData.vote_average || 0,


    /*
     * ジャンル
     */

    genres:
      detailData.genres || [],


    /*
     * 監督
     */

    director:
      director
        ? {

            name:
              director.name

          }

        : null,


    /*
     * 出演者
     */

    cast:
      cast,


    /*
     * 見放題
     */

    streaming:
      streaming,


    /*
     * レンタル
     */

    rental:
      rental,


    /*
     * 購入
     */

    purchase:
      purchase,


    /*
     * TMDB / JustWatch
     * 配信情報ページ
     */

    link:
      japan.link || null,


    /*
     * 配信情報の更新時刻
     */

    providers_updated_at:
      updatedAt,


    /*
     * 配信地域
     */

    providers_region:
      "JP",


    /*
     * データ提供元
     */

    providers_source:
      "TMDB / JustWatch",


    /*
     * シリーズ
     */

    series:

      collection

        ? {

            id:
              collection.id,

            name:
              collection.name,

            movies:
              seriesMovies

          }

        : null

  });

}


/*
 * =========================================
 * 配信サービス整理関数
 * =========================================
 *
 * ① 重複削除
 * ② 表示順整理
 * ③ サービス名整理
 * ④ TMDB配信ページURL保持
 * =========================================
 */

function normalizeProviders(
  providers,
  watchLink
) {

  if (
    !Array.isArray(providers)
  ) {

    return [];

  }


  /*
   * -----------------------------------------
   * 重複削除
   * -----------------------------------------
   */

  const unique =
    new Map();


  providers.forEach(
    function(provider) {

      if (
        !provider ||
        !provider.provider_id
      ) {

        return;

      }


      const providerId =
        String(
          provider.provider_id
        );


      if (
        !unique.has(providerId)
      ) {

        unique.set(
          providerId,
          provider
        );

      }

    }
  );


  /*
   * -----------------------------------------
   * 配信サービスを配列化
   * -----------------------------------------
   */

  const result =
    Array.from(
      unique.values()
    );


  /*
   * -----------------------------------------
   * 表示順
   * -----------------------------------------
   */

  result.sort(
    function(a, b) {

      const priorityA =
        Number.isFinite(
          Number(a.display_priority)
        )
          ? Number(a.display_priority)
          : 9999;


      const priorityB =
        Number.isFinite(
          Number(b.display_priority)
        )
          ? Number(b.display_priority)
          : 9999;


      if (
        priorityA !== priorityB
      ) {

        return (
          priorityA -
          priorityB
        );

      }


      return String(
        a.provider_name || ""
      ).localeCompare(
        String(
          b.provider_name || ""
        ),
        "ja"
      );

    }
  );


  /*
   * -----------------------------------------
   * サービス名整理
   * -----------------------------------------
   */

  return result.map(
    function(provider) {

      const originalName =
        provider.provider_name || "";


      return {

        provider_id:
          provider.provider_id,

        provider_name:
          normalizeProviderName(
            originalName
          ),

        logo_path:
          provider.logo_path || null,

        display_priority:
          provider.display_priority ?? 9999,

        /*
         * TMDBが提供する
         * 配信情報ページ
         */

        watch_link:
          watchLink || null

      };

    }
  );

}


/*
 * =========================================
 * 配信サービス名整理
 * =========================================
 */

function normalizeProviderName(
  name
) {

  const value =
    String(name || "")
      .trim();


  /*
   * Amazon Prime Video
   */

  if (
    value === "Prime Video" ||
    value === "Amazon Prime Video"
  ) {

    return "Amazon Prime Video";

  }


  /*
   * Netflix
   */

  if (
    value === "Netflix"
  ) {

    return "Netflix";

  }


  /*
   * U-NEXT
   */

  if (
    value === "U-NEXT"
  ) {

    return "U-NEXT";

  }


  /*
   * Disney+
   */

  if (
    value === "Disney Plus" ||
    value === "Disney+"
  ) {

    return "Disney+";

  }


  /*
   * Hulu
   */

  if (
    value === "Hulu"
  ) {

    return "Hulu";

  }


  /*
   * Apple TV
   */

  if (
    value === "Apple TV" ||
    value === "Apple TV Plus"
  ) {

    return "Apple TV";

  }


  /*
   * Google Play Movies
   */

  if (
    value === "Google Play Movies" ||
    value === "Google Play"
  ) {

    return "Google Play Movies";

  }


  /*
   * FOD
   */

  if (
    value === "FOD"
  ) {

    return "FOD";

  }


  /*
   * それ以外
   */

  return value;

}
