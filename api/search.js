// =========================================================
// doko-de-mireru
// api/search.js
// 安定版
// =========================================================

module.exports = async function handler(req, res) {

  try {

    // =====================================================
    // CORS
    // =====================================================

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,OPTIONS"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }


    // =====================================================
    // TMDB API KEY
    // =====================================================

    const apiKey =
      process.env.TMDB_API_KEY;

    if (!apiKey) {

      return res.status(500).json({
        error:
          "TMDB_API_KEY が設定されていません。"
      });

    }


    // =====================================================
    // パラメータ
    // =====================================================

    const query =
      typeof req.query.query === "string"
        ? req.query.query.trim()
        : "";

    const id =
      typeof req.query.id === "string"
        ? req.query.id.trim()
        : "";


    // =====================================================
    // IDがある場合 → 詳細
    // =====================================================

    if (id) {

      return await getMovieDetail(
        id,
        apiKey,
        res
      );

    }


    // =====================================================
    // IDがなく検索文字もない
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error:
          "映画名を入力してください。"
      });

    }


    // =====================================================
    // 映画検索
    // =====================================================

    const url =
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&region=JP" +
      "&query=" +
      encodeURIComponent(query) +
      "&include_adult=false" +
      "&page=1";


    const response =
      await fetch(url);


    if (!response.ok) {

      const text =
        await response.text();

      console.error(
        "TMDB search error:",
        text
      );

      return res.status(500).json({
        error:
          "TMDB映画検索に失敗しました。"
      });

    }


    const data =
      await response.json();


    let movies =
      Array.isArray(data.results)
        ? data.results
        : [];


    // =====================================================
    // 最大10件
    // =====================================================

    movies =
      movies
        .filter(function(movie) {

          return (
            movie &&
            movie.id &&
            movie.title
          );

        })
        .slice(0, 10);


    // =====================================================
    // 結果
    // =====================================================

    const results =
      movies.map(function(movie) {

        return {

          id:
            movie.id,

          title:
            movie.title || "",

          original_title:
            movie.original_title || "",

          release_date:
            movie.release_date || "",

          poster_path:
            movie.poster_path || null,

          overview:
            movie.overview || "",

          vote_average:
            Number(movie.vote_average || 0)

        };

      });


    return res.status(200).json({
      results: results
    });


  } catch (error) {

    console.error(
      "API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error &&
        error.message
          ? error.message
          : "サーバーでエラーが発生しました。"
    });

  }

};


// =========================================================
// 作品詳細
// =========================================================

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

  try {

    const url =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&append_to_response=credits,watch/providers";


    const response =
      await fetch(url);


    if (!response.ok) {

      const text =
        await response.text();

      console.error(
        "TMDB detail error:",
        text
      );

      return res.status(404).json({
        error:
          "作品情報を取得できませんでした。"
      });

    }


    const movie =
      await response.json();


    // =====================================================
    // 日本の配信情報
    // =====================================================

    const providers =
      movie &&
      movie["watch/providers"] &&
      movie["watch/providers"].results &&
      movie["watch/providers"].results.JP
        ? movie["watch/providers"].results.JP
        : {};


    const streaming =
      Array.isArray(providers.flatrate)
        ? providers.flatrate
        : [];


    const rental =
      Array.isArray(providers.rent)
        ? providers.rent
        : [];


    const purchase =
      Array.isArray(providers.buy)
        ? providers.buy
        : [];


    // =====================================================
    // 監督
    // =====================================================

    let director = null;


    const crew =
      movie &&
      movie.credits &&
      Array.isArray(movie.credits.crew)
        ? movie.credits.crew
        : [];


    for (
      let i = 0;
      i < crew.length;
      i++
    ) {

      if (
        crew[i] &&
        crew[i].job === "Director"
      ) {

        director = {

          id:
            crew[i].id,

          name:
            crew[i].name || ""

        };

        break;

      }

    }


    // =====================================================
    // 出演者
    // =====================================================

    const cast =
      movie &&
      movie.credits &&
      Array.isArray(movie.credits.cast)
        ? movie.credits.cast
            .slice(0, 8)
            .map(function(person) {

              return {

                id:
                  person.id,

                name:
                  person.name || ""

              };

            })
        : [];


    // =====================================================
    // シリーズ
    // =====================================================

    let series = null;


    if (
      movie.belongs_to_collection &&
      movie.belongs_to_collection.id
    ) {

      series =
        await getCollection(
          movie.belongs_to_collection.id,
          apiKey
        );

    }


    // =====================================================
    // 配信サービスの整理
    // =====================================================

    const result = {

      id:
        movie.id,

      title:
        movie.title || "",

      original_title:
        movie.original_title || "",

      release_date:
        movie.release_date || "",

      poster_path:
        movie.poster_path || null,

      overview:
        movie.overview || "",

      vote_average:
        Number(movie.vote_average || 0),

      genres:
        Array.isArray(movie.genres)
          ? movie.genres
          : [],

      original_language:
        movie.original_language || "",

      director:
        director,

      cast:
        cast,

      streaming:
        streaming,

      rental:
        rental,

      purchase:
        purchase,

      series:
        series,

      link:
        providers.link ||
        (
          "https://www.themoviedb.org/movie/" +
          movie.id
        )

    };


    return res.status(200).json(
      result
    );


  } catch (error) {

    console.error(
      "DETAIL ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error &&
        error.message
          ? error.message
          : "作品詳細の取得に失敗しました。"
    });

  }

}


// =========================================================
// シリーズ取得
// =========================================================

async function getCollection(
  collectionId,
  apiKey
) {

  try {

    const url =
      "https://api.themoviedb.org/3/collection/" +
      encodeURIComponent(collectionId) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP";


    const response =
      await fetch(url);


    if (!response.ok) {

      return null;

    }


    const data =
      await response.json();


    let movies =
      Array.isArray(data.parts)
        ? data.parts
        : [];


    movies =
      movies
        .filter(function(movie) {

          return (
            movie &&
            movie.id
          );

        })
        .sort(function(a, b) {

          const dateA =
            a.release_date || "9999-99-99";

          const dateB =
            b.release_date || "9999-99-99";

          return dateA.localeCompare(
            dateB
          );

        });


    return {

      name:
        data.name || "",

      movies:
        movies.map(function(movie) {

          return {

            id:
              movie.id,

            title:
              movie.title || "",

            release_date:
              movie.release_date || "",

            poster_path:
              movie.poster_path || null

          };

        })

    };


  } catch (error) {

    console.error(
      "Collection error:",
      error
    );

    return null;

  }

}
