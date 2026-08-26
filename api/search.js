export default async function handler(req, res) {

  try {

    const apiKey = process.env.TMDB_API_KEY;


    /*
     * =========================================
     * APIキー確認
     * =========================================
     */

    if (!apiKey) {

      return res.status(500).json({

        error:
          "TMDB APIキーが設定されていません"

      });

    }


    /*
     * =========================================
     * ① 作品IDがある場合
     *    → 作品詳細
     * =========================================
     */

    const movieId = req.query.id;


    if (movieId) {

      return await getMovieDetail(
        movieId,
        apiKey,
        res
      );

    }


    /*
     * =========================================
     * ② 映画名検索
     * =========================================
     */

    const query = req.query.query;


    if (!query) {

      return res.status(400).json({

        error:
          "映画名を入力してください"

      });

    }


    /*
     * =========================================
     * TMDB検索
     * =========================================
     */

    const searchUrl =
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" + apiKey +
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
     * 各作品のシリーズ情報を確認
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
                apiKey +
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

            catch(error) {

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
         * Untitled作品を検索結果から除外
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

          normalMovies.push(movie);

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
     *
     * シリーズ作品
     *   ↓
     * 公開順
     *
     * その他
     *   ↓
     * TMDB関連度順
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
   *
   * creditsを同時取得
   * =========================================
   */

  const detailUrl =
    "https://api.themoviedb.org/3/movie/" +
    movieId +
    "?api_key=" +
    apiKey +
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
   * 配信情報
   * =========================================
   */

  const providersUrl =
    "https://api.themoviedb.org/3/movie/" +
    movieId +
    "/watch/providers" +
    "?api_key=" +
    apiKey;


  const providersResponse =
    await fetch(providersUrl);


  let providersData = {};


  if (providersResponse.ok) {

    providersData =
      await providersResponse.json();

  }


  const japan =
    providersData.results &&
    providersData.results.JP
      ? providersData.results.JP
      : {};


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
      collection.id +
      "?api_key=" +
      apiKey +
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
     * ⭐ 評価
     */

    vote_average:
      detailData.vote_average || 0,


    /*
     * 🎭 ジャンル
     */

    genres:
      detailData.genres || [],


    /*
     * 🎬 監督
     */

    director:
      director
        ? {

            name:
              director.name

          }

        : null,


    /*
     * 👤 出演者
     */

    cast:
      cast,


    /*
     * 🟢 見放題
     */

    streaming:
      japan.flatrate || [],


    /*
     * 🟡 レンタル
     */

    rental:
      japan.rent || [],


    /*
     * 🔵 購入
     */

    purchase:
      japan.buy || [],


    /*
     * 🔗 TMDB配信情報
     */

    link:
      japan.link || null,


    /*
     * 🎞️ シリーズ
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
