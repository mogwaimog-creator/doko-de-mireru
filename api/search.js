// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版
// TMDB検索 + 作品詳細 + 日本の配信情報
// =========================================================

module.exports = async function handler(req, res) {

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


  try {

    // =====================================================
    // API KEY
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
      req.query &&
      typeof req.query.query === "string"
        ? req.query.query.trim()
        : "";


    const id =
      req.query &&
      typeof req.query.id === "string"
        ? req.query.id.trim()
        : "";


    // =====================================================
    // 作品詳細
    // /api/search?id=519182
    // =====================================================

    if (id) {

      const movie =
        await getMovieDetail(
          id,
          apiKey
        );


      return res.status(200).json(movie);

    }


    // =====================================================
    // 検索
    // /api/search?query=怪盗グルー
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error:
          "映画名を入力してください。"
      });

    }


    const url =
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&region=JP" +
      "&include_adult=false" +
      "&page=1" +
      "&query=" +
      encodeURIComponent(query);


    const data =
      await fetchJson(url);


    let movies =
      Array.isArray(data.results)
        ? data.results
        : [];


    movies =
      movies.filter(function(movie) {

        return (
          movie &&
          movie.id &&
          movie.title
        );

      });


    const normalized =
      normalizeTitle(query);


    movies.sort(function(a, b) {

      const aTitle =
        normalizeTitle(
          a.title
        );

      const bTitle =
        normalizeTitle(
          b.title
        );


      const aExact =
        aTitle === normalized
          ? 0
          : 1;


      const bExact =
        bTitle === normalized
          ? 0
          : 1;


      if (
        aExact !== bExact
      ) {

        return aExact - bExact;

      }


      return (
        Number(b.vote_average || 0) -
        Number(a.vote_average || 0)
      );

    });


    movies =
      movies.slice(0, 10);


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
            Number(
              movie.vote_average || 0
            )

        };

      });


    return res.status(200).json({
      results: results
    });


  } catch (error) {

    console.error(
      "SEARCH API ERROR:",
      error
    );


    return res.status(500).json({

      error:
        error &&
        error.message
          ? error.message
          : "サーバーエラーが発生しました。"

    });

  }

};


// =========================================================
// 作品詳細
// =========================================================

async function getMovieDetail(
  movieId,
  apiKey
) {

  // -------------------------------------------------------
  // 作品本体
  // -------------------------------------------------------

  const movieUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&append_to_response=credits";


  const movie =
    await fetchJson(movieUrl);


  // -------------------------------------------------------
  // 配信情報は別APIで取得
  //
  // TMDB公式のWatch Providers API
  // -------------------------------------------------------

  let watchData = null;


  try {

    const watchUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "/watch/providers" +
      "?api_key=" +
      encodeURIComponent(apiKey);


    watchData =
      await fetchJson(watchUrl);

  } catch (error) {

    console.error(
      "WATCH PROVIDER ERROR:",
      error
    );

  }


  // -------------------------------------------------------
  // 日本
  // -------------------------------------------------------

  const jp =
    watchData &&
    watchData.results &&
    watchData.results.JP
      ? watchData.results.JP
      : {};


  // -------------------------------------------------------
  // 配信
  // -------------------------------------------------------

  const streaming =
    normalizeProviders(
      jp.flatrate
    );


  const rental =
    normalizeProviders(
      jp.rent
    );


  const purchase =
    normalizeProviders(
      jp.buy
    );


  // -------------------------------------------------------
  // TMDBの配信ページ
  //
  // 重要：
  // TMDB Watch Providersは
  // Netflix等の完全な作品URLを
  // 必ず返す仕様ではありません。
  // -------------------------------------------------------

  const providerLink =
    jp.link ||
    (
      "https://www.themoviedb.org/movie/" +
      movie.id +
      "/watch?locale=JP"
    );


  // -------------------------------------------------------
  // タイトル
  // -------------------------------------------------------

  const title =
    movie.title ||
    movie.original_title ||
    "";


  // -------------------------------------------------------
  // サービス判定
  // -------------------------------------------------------

  const netflix =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "netflix"
      ]
    );


  const amazon =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "amazon"
      ]
    );


  const unext =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "u-next",
        "unext"
      ]
    );


  const hulu =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "hulu"
      ]
    );


  const disney =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "disney"
      ]
    );


  const apple =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "apple"
      ]
    );


  // -------------------------------------------------------
  // 各サービスURL
  // -------------------------------------------------------

  const netflixUrl =
    netflix
      ? createNetflixUrl(
          title
        )
      : null;


  const amazonUrl =
    amazon
      ? createAmazonUrl(
          title
        )
      : null;


  const unextUrl =
    unext
      ? createUnextUrl(
          title
        )
      : null;


  const huluUrl =
    hulu
      ? createHuluUrl(
          title
        )
      : null;


  const disneyUrl =
    disney
      ? createDisneyUrl(
          title
        )
      : null;


  const appleUrl =
    apple
      ? createAppleUrl(
          title
        )
      : null;


  // -------------------------------------------------------
  // 監督
  // -------------------------------------------------------

  const director =
    getDirector(movie);


  // -------------------------------------------------------
  // 出演者
  // -------------------------------------------------------

  const cast =
    getCast(movie);


  // -------------------------------------------------------
  // シリーズ
  // -------------------------------------------------------

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
  // 返却
  // =====================================================

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
      Number(
        movie.vote_average || 0
      ),

    original_language:
      movie.original_language || "",

    genres:
      Array.isArray(movie.genres)
        ? movie.genres
        : [],


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


    // ---------------------------------------------------
    // Netflix
    // ---------------------------------------------------

    netflix:
      netflix
        ? {
            url: netflixUrl
          }
        : null,

    netflix_url:
      netflixUrl,

    netflix_title_id:
      null,

    netflix_id:
      null,


    // ---------------------------------------------------
    // Amazon
    // ---------------------------------------------------

    amazon:
      amazon
        ? {
            url: amazonUrl
          }
        : null,

    amazon_url:
      amazonUrl,


    // ---------------------------------------------------
    // U-NEXT
    // ---------------------------------------------------

    unext_url:
      unextUrl,


    // ---------------------------------------------------
    // Hulu
    // ---------------------------------------------------

    hulu_url:
      huluUrl,


    // ---------------------------------------------------
    // Disney+
    // ---------------------------------------------------

    disney_url:
      disneyUrl,


    // ---------------------------------------------------
    // Apple TV
    // ---------------------------------------------------

    apple_tv_url:
      appleUrl,


    // ---------------------------------------------------
    // TMDB
    // ---------------------------------------------------

    link:
      providerLink,


    // ---------------------------------------------------
    // シリーズ
    // ---------------------------------------------------

    series:
      series

  };

}


// =========================================================
// fetch JSON
// =========================================================

async function fetchJson(url) {

  const response =
    await fetch(
      url,
      {
        method: "GET",
        headers: {
          "Accept":
            "application/json"
        }
      }
    );


  const text =
    await response.text();


  let data;


  try {

    data =
      JSON.parse(text);

  } catch (error) {

    throw new Error(
      "TMDBから正しいJSONデータを取得できませんでした。"
    );

  }


  if (!response.ok) {

    throw new Error(
      data &&
      data.status_message
        ? data.status_message
        : "TMDB API ERROR " +
          response.status
    );

  }


  return data;

}


// =========================================================
// 配信サービス
// =========================================================

function normalizeProviders(
  providers
) {

  if (
    !Array.isArray(providers)
  ) {

    return [];

  }


  return providers
    .filter(function(provider) {

      return (
        provider &&
        provider.provider_name
      );

    })
    .map(function(provider) {

      return {

        provider_id:
          provider.provider_id || null,

        provider_name:
          provider.provider_name || "",

        logo_path:
          provider.logo_path || null,

        provider_url:
          provider.provider_url || null

      };

    });

}


// =========================================================
// サービス検索
// =========================================================

function findProvider(
  streaming,
  rental,
  purchase,
  keywords
) {

  const all =
    []
      .concat(streaming || [])
      .concat(rental || [])
      .concat(purchase || []);


  for (
    let i = 0;
    i < all.length;
    i++
  ) {

    const provider =
      all[i];


    const name =
      String(
        provider.provider_name || ""
      ).toLowerCase();


    for (
      let j = 0;
      j < keywords.length;
      j++
    ) {

      if (
        name.includes(
          keywords[j].toLowerCase()
        )
      ) {

        return provider;

      }

    }

  }


  return null;

}


// =========================================================
// Netflix
// =========================================================

function createNetflixUrl(
  title
) {

  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Amazon
// =========================================================

function createAmazonUrl(
  title
) {

  return (
    "https://www.amazon.co.jp/s" +
    "?k=" +
    encodeURIComponent(title) +
    "&i=instant-video"
  );

}


// =========================================================
// U-NEXT
// =========================================================

function createUnextUrl(
  title
) {

  return (
    "https://video.unext.jp/search/" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Hulu
// =========================================================

function createHuluUrl(
  title
) {

  return (
    "https://www.hulu.jp/search?q=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Disney+
// =========================================================

function createDisneyUrl(
  title
) {

  return (
    "https://www.disneyplus.com/ja-jp/search/" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Apple TV
// =========================================================

function createAppleUrl(
  title
) {

  return (
    "https://tv.apple.com/jp/search?term=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// 監督
// =========================================================

function getDirector(
  movie
) {

  const crew =
    movie &&
    movie.credits &&
    Array.isArray(
      movie.credits.crew
    )
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

      return {

        id:
          crew[i].id || null,

        name:
          crew[i].name || ""

      };

    }

  }


  return null;

}


// =========================================================
// 出演者
// =========================================================

function getCast(
  movie
) {

  const cast =
    movie &&
    movie.credits &&
    Array.isArray(
      movie.credits.cast
    )
      ? movie.credits.cast
      : [];


  return cast
    .slice(0, 8)
    .map(function(person) {

      return {

        id:
          person.id || null,

        name:
          person.name || ""

      };

    });

}


// =========================================================
// シリーズ
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


    const data =
      await fetchJson(url);


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

          return String(
            a.release_date ||
            "9999-99-99"
          ).localeCompare(
            String(
              b.release_date ||
              "9999-99-99"
            )
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
      "COLLECTION ERROR:",
      error
    );


    return null;

  }

}


// =========================================================
// タイトル正規化
// =========================================================

function normalizeTitle(
  title
) {

  return String(
    title || ""
  )
    .toLowerCase()
    .replace(
      /[\s　]/g,
      ""
    )
    .replace(
      /[「」『』【】（）()・:：!?！？,.，。]/g,
      ""
    );

}
