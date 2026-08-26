export default async function handler(req, res) {

  try {

    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "TMDB APIキーが設定されていません"
      });
    }


    /*
     * =========================================
     * ① 作品IDがある場合
     *    → 作品詳細を返す
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
     * ② 映画名で検索
     *    → 複数作品を返す
     * =========================================
     */

    const query = req.query.query;

    if (!query) {

      return res.status(400).json({
        error: "映画名を入力してください"
      });

    }


    const searchUrl =
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" + apiKey +
      "&language=ja-JP" +
      "&query=" + encodeURIComponent(query) +
      "&region=JP" +
      "&include_adult=false";


    const searchResponse =
      await fetch(searchUrl);


    const searchData =
      await searchResponse.json();


    if (
      !searchData.results ||
      searchData.results.length === 0
    ) {

      return res.status(404).json({
        error: "映画が見つかりませんでした"
      });

    }


    /*
     * 最大10作品を返す
     */

    /*
 * =========================================
 * 検索結果を整理
 * シリーズ作品なら公開順
 * それ以外はTMDBの関連度順
 * =========================================
 */

const rawMovies =
  searchData.results.slice(0, 10);


/*
 * 各作品のシリーズ情報を確認
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
            "?api_key=" + apiKey +
            "&language=ja-JP";


          const detailResponse =
            await fetch(detailUrl);


          const detailData =
            await detailResponse.json();


          collection =
            detailData.belongs_to_collection ||
            null;

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

          collection:
            collection

        };

      }
    )

  );


/*
 * =========================================
 * シリーズごとにまとめる
 * =========================================
 */

const seriesGroups = {};

const normalMovies = [];


moviesWithSeries.forEach(
  function(movie) {

    if(movie.collection) {

      const collectionId =
        movie.collection.id;


      if(!seriesGroups[collectionId]) {

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
 * 最終的な検索結果
 *
 * ① シリーズ作品 → 公開順
 * ② その他 → TMDB関連度順
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
  detailData.vote_average,

genres:
  detailData.genres || [],

director:
  detailData.credits &&
  detailData.credits.crew
    ? detailData.credits.crew.find(
        function(person){
          return person.job === "Director";
        }
      ) || null
    : null,

cast:
  detailData.credits &&
  detailData.credits.cast
    ? detailData.credits.cast
        .slice(0, 8)
        .map(function(person){
          return {
            name: person.name,
            character: person.character
          };
        })
    : [],

          overview:
            movie.overview,

          poster_path:
            movie.poster_path

        };

      }
    );


return res.status(200).json({

  results:
    movies

});


  } catch (error) {

    console.error(error);

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
   * 作品情報
   */

  const detailUrl =
  "https://api.themoviedb.org/3/movie/" +
  movieId +
  "?api_key=" + apiKey +
  "&language=ja-JP" +
  "&append_to_response=credits";


  const detailResponse =
    await fetch(detailUrl);


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
    "?api_key=" + apiKey;


  const providersResponse =
    await fetch(providersUrl);


  const providersData =
    await providersResponse.json();


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
      "?api_key=" + apiKey +
      "&language=ja-JP";


    const collectionResponse =
      await fetch(collectionUrl);


    const collectionData =
      await collectionResponse.json();


    if (
      collectionData.parts &&
      collectionData.parts.length
    ) {

      seriesMovies =
        collectionData.parts
          .sort(function(a, b) {

            const dateA =
              a.release_date ||
              "9999-99-99";

            const dateB =
              b.release_date ||
              "9999-99-99";

            return dateA.localeCompare(
              dateB
            );

          })
          .map(function(item) {

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

          });

    }

  }


  /*
   * =========================================
   * 詳細情報を返す
   * =========================================
   */

  return res.status(200).json({

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
     * 配信
     */

    streaming:
      japan.flatrate || [],

    rental:
      japan.rent || [],

    purchase:
      japan.buy || [],

    link:
      japan.link || null,


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
