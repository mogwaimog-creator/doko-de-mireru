// =========================================================
// doko-de-mireru
// api/search.js
//
// TMDB映画検索
// 日本の配信情報
// Netflix / Prime Video / U-NEXT / Hulu / Disney+ など
// 映画詳細
// シリーズ
// 監督
// 出演者
//
// Netflixについて
// ---------------------------------------------------------
// TMDB Watch ProvidersだけではNetflixの作品IDを
// 安全に取得できない場合があります。
// そのため、既知のNetflix作品IDを登録できる仕組みを
// 用意しています。
// =========================================================

export default async function handler(req, res) {

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
    // API KEY
    // =====================================================

    const TMDB_API_KEY =
      process.env.TMDB_API_KEY;

    if (!TMDB_API_KEY) {

      console.error(
        "TMDB_API_KEY is missing"
      );

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
    // 映画詳細
    // =====================================================

    if (id) {

      return await getMovieDetail(
        id,
        TMDB_API_KEY,
        res
      );

    }


    // =====================================================
    // 映画検索
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error:
          "映画名を入力してください。"
      });

    }

    return await searchMovies(
      query,
      TMDB_API_KEY,
      res
    );

  } catch (error) {

    console.error(
      "search.js error:",
      error
    );

    return res.status(500).json({
      error:
        getErrorMessage(error)
    });

  }

}


// =========================================================
// 映画検索
// =========================================================

async function searchMovies(
  query,
  apiKey,
  res
) {

  try {

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

      return res.status(502).json({
        error:
          "TMDB映画検索に失敗しました。"
      });

    }


    const data =
      await response.json();


    let results =
      Array.isArray(data.results)
        ? data.results
        : [];


    results =
      results.filter(
        function(movie) {

          return (
            movie &&
            movie.id &&
            movie.title
          );

        }
      );


    // =====================================================
    // 古い順
    // =====================================================

    results.sort(
      function(a, b) {

        const dateA =
          isValidDate(a.release_date)
            ? a.release_date
            : "9999-99-99";

        const dateB =
          isValidDate(b.release_date)
            ? b.release_date
            : "9999-99-99";

        return dateA.localeCompare(dateB);

      }
    );


    // =====================================================
    // 最大10件
    // =====================================================

    results =
      results.slice(0, 10);


    const movies =
      results.map(
        function(movie) {

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
              Number(movie.vote_average) || 0

          };

        }
      );


    return res.status(200).json({
      results: movies
    });


  } catch (error) {

    console.error(
      "searchMovies error:",
      error
    );

    return res.status(500).json({
      error:
        "映画検索中にサーバーエラーが発生しました。"
    });

  }

}


// =========================================================
// 映画詳細
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
    // 基本情報
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
        Number(movie.vote_average) || 0,

      genres:
        Array.isArray(movie.genres)
          ? movie.genres
          : [],

      director:
        getDirector(movie),

      cast:
        getCast(movie),

      language:
        getLanguageInfo(movie),

      streaming: [],

      rental: [],

      purchase: [],

      link:
        "https://www.themoviedb.org/movie/" +
        movie.id,

      netflix:
        null,

      netflix_title_id:
        null,

      netflix_id:
        null,

      netflix_url:
        null,

      series:
        null

    };


    // =====================================================
    // 日本の配信情報
    // =====================================================

    const providers =
      movie &&
      movie["watch/providers"] &&
      movie["watch/providers"].results &&
      movie["watch/providers"].results.JP
        ? movie["watch/providers"].results.JP
        : null;


    if (providers) {

      result.streaming =
        Array.isArray(providers.flatrate)
          ? providers.flatrate
          : [];

      result.rental =
        Array.isArray(providers.rent)
          ? providers.rent
          : [];

      result.purchase =
        Array.isArray(providers.buy)
          ? providers.buy
          : [];

    }


    // =====================================================
    // Netflix
    // =====================================================

    const netflixInfo =
      getNetflixInfo(
        movie
      );


    if (netflixInfo) {

      result.netflix =
        netflixInfo;

      result.netflix_title_id =
        netflixInfo.title_id || null;

      result.netflix_id =
        netflixInfo.title_id || null;

      result.netflix_url =
        netflixInfo.url || null;

    }


    // =====================================================
    // TMDB配信ページ
    // =====================================================

    if (
      providers &&
      providers.link
    ) {

      result.link =
        providers.link;

    }


    // =====================================================
    // シリーズ
    // =====================================================

    if (movie.belongs_to_collection) {

      result.series =
        await getCollectionInfo(
          movie.belongs_to_collection,
          apiKey
        );

    }


    return res.status(200).json(
      result
    );

  } catch (error) {

    console.error(
      "getMovieDetail error:",
      error
    );

    return res.status(500).json({
      error:
        "作品詳細の取得中にサーバーエラーが発生しました。"
    });

  }

}


// =========================================================
// Netflix情報
// =========================================================
//
// ここに既知のNetflix作品IDを登録できます。
// =========================================================

function getNetflixInfo(
  movie
) {

  if (!movie) {
    return null;
  }


  const title =
    String(
      movie.title ||
      ""
    ).trim();


  // =====================================================
  // 怪盗グルーのミニオン超変身
  // Netflix作品ID：81776693
  // =====================================================

  if (
    normalizeTitle(title) ===
    normalizeTitle(
      "怪盗グルーのミニオン超変身"
    )
  ) {

    return {

      title_id:
        "81776693",

      url:
        "https://www.netflix.com/jp/title/81776693"

    };

  }


  // =====================================================
  // TMDBデータにNetflix URLが存在する場合
  // =====================================================

  const possibleUrls = [

    movie.netflix_url,

    movie.netflix_link,

    movie.netflixUrl,

    movie.netflixLink

  ];


  for (
    let i = 0;
    i < possibleUrls.length;
    i++
  ) {

    const normalized =
      normalizeNetflixUrl(
        possibleUrls[i]
      );


    if (normalized) {

      return {

        title_id:
          extractNetflixTitleId(
            normalized
          ),

        url:
          normalized

      };

    }

  }


  // =====================================================
  // Netflix配信サービスがあるか確認
  // =====================================================

  const providers =
    movie &&
    movie["watch/providers"] &&
    movie["watch/providers"].results &&
    movie["watch/providers"].results.JP
      ? movie["watch/providers"].results.JP
      : null;


  if (!providers) {

    return null;

  }


  const allServices = []
    .concat(
      Array.isArray(providers.flatrate)
        ? providers.flatrate
        : []
    )
    .concat(
      Array.isArray(providers.rent)
        ? providers.rent
        : []
    )
    .concat(
      Array.isArray(providers.buy)
        ? providers.buy
        : []
    );


  for (
    let i = 0;
    i < allServices.length;
    i++
  ) {

    const service =
      allServices[i];


    if (!service) {
      continue;
    }


    const name =
      String(
        service.provider_name ||
        ""
      ).toLowerCase();


    if (
      name.includes("netflix")
    ) {

      const url =
        findNetflixUrl(
          movie,
          service
        );


      if (url) {

        return {

          title_id:
            extractNetflixTitleId(url),

          url:
            url

        };

      }


      // =================================================
      // Netflix作品IDが不明な場合
      // 検索ページへ
      // =================================================

      return {

        title_id:
          null,

        url:
          createNetflixSearchUrl(
            title
          )

      };

    }

  }


  return null;

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
    .normalize("NFKC")
    .replace(
      /\s+/g,
      ""
    )
    .replace(
      /[！!？?。、．，,「」『』【】（）()]/g,
      ""
    )
    .toLowerCase();

}


// =========================================================
// Netflixサービス判定
// =========================================================

function findNetflixService(
  streaming,
  rental,
  purchase
) {

  const all = []
    .concat(
      Array.isArray(streaming)
        ? streaming
        : []
    )
    .concat(
      Array.isArray(rental)
        ? rental
        : []
    )
    .concat(
      Array.isArray(purchase)
        ? purchase
        : []
    );


  for (
    let i = 0;
    i < all.length;
    i++
  ) {

    const service =
      all[i];


    if (!service) {
      continue;
    }


    const name =
      String(
        service.provider_name ||
        service.name ||
        ""
      ).toLowerCase();


    if (
      name.includes("netflix")
    ) {

      return service;

    }

  }


  return null;

}


// =========================================================
// Netflix URL取得
// =========================================================

function findNetflixUrl(
  movie,
  service
) {

  const urls = [

    service &&
    service.provider_url,

    service &&
    service.watch_link,

    service &&
    service.netflix_url,

    service &&
    service.url,

    service &&
    service.link,

    movie &&
    movie.netflix_url,

    movie &&
    movie.netflix_link

  ];


  for (
    let i = 0;
    i < urls.length;
    i++
  ) {

    const normalized =
      normalizeNetflixUrl(
        urls[i]
      );


    if (normalized) {

      return normalized;

    }

  }


  return null;

}


// =========================================================
// Netflix検索URL
// =========================================================

function createNetflixSearchUrl(
  title
) {

  const cleanTitle =
    String(
      title || ""
    ).trim();


  if (!cleanTitle) {

    return "https://www.netflix.com/jp/";

  }


  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(
      cleanTitle
    )
  );

}


// =========================================================
// Netflix URL → ID
// =========================================================

function extractNetflixTitleId(
  url
) {

  if (
    typeof url !== "string" ||
    !url
  ) {

    return null;

  }


  const patterns = [

    /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i,

    /netflix\.com\/(?:[^/]+\/)?watch\/(\d+)/i,

    /netflix\.com\/title\/(\d+)/i,

    /netflix\.com\/watch\/(\d+)/i

  ];


  for (
    let i = 0;
    i < patterns.length;
    i++
  ) {

    const match =
      url.match(
        patterns[i]
      );


    if (match) {

      return match[1];

    }

  }


  return null;

}


// =========================================================
// Netflix URL正規化
// =========================================================

function normalizeNetflixUrl(
  url
) {

  if (
    typeof url !== "string" ||
    !url.trim()
  ) {

    return null;

  }


  const clean =
    url.trim();


  const id =
    extractNetflixTitleId(
      clean
    );


  if (id) {

    return (
      "https://www.netflix.com/jp/title/" +
      encodeURIComponent(id)
    );

  }


  if (
    /^https?:\/\/(?:www\.)?netflix\.com\//i
      .test(clean)
  ) {

    return clean;

  }


  return null;

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

      return {

        id:
          crew[i].id,

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
    Array.isArray(movie.credits.cast)
      ? movie.credits.cast
      : [];


  return cast
    .slice(0, 8)
    .map(
      function(person) {

        return {

          id:
            person.id,

          name:
            person.name || ""

        };

      }
    );

}


// =========================================================
// 言語
// =========================================================

function getLanguageInfo(
  movie
) {

  return {

    original_language:
      movie &&
      movie.original_language
        ? movie.original_language
        : null,

    subtitle:
      null,

    dubbing:
      null

  };

}


// =========================================================
// シリーズ情報
// =========================================================

async function getCollectionInfo(
  collection,
  apiKey
) {

  if (
    !collection ||
    !collection.id
  ) {

    return null;

  }


  const url =
    "https://api.themoviedb.org/3/collection/" +
    encodeURIComponent(collection.id) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP";


  try {

    const response =
      await fetch(url);


    if (!response.ok) {

      return null;

    }


    const data =
      await response.json();


    const movies =
      Array.isArray(data.parts)
        ? data.parts
        : [];


    movies.sort(
      function(a, b) {

        const dateA =
          isValidDate(a.release_date)
            ? a.release_date
            : "9999-99-99";

        const dateB =
          isValidDate(b.release_date)
            ? b.release_date
            : "9999-99-99";

        return dateA.localeCompare(dateB);

      }
    );


    return {

      name:
        data.name ||
        collection.name ||
        "",

      movies:
        movies.map(
          function(movie) {

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

          }
        )

    };

  } catch (error) {

    console.error(
      "Collection error:",
      error
    );

    return null;

  }

}


// =========================================================
// 日付判定
// =========================================================

function isValidDate(
  date
) {

  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date)
  );

}


// =========================================================
// エラー
// =========================================================

function getErrorMessage(
  error
) {

  if (
    error &&
    typeof error.message === "string"
  ) {

    return error.message;

  }


  if (
    typeof error === "string"
  ) {

    return error;

  }


  return (
    "サーバーでエラーが発生しました。"
  );

}
