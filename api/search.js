// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版
//
// TMDB映画検索
// 日本の配信情報
// Netflix / Prime Video / U-NEXT / Hulu
// Disney+ / Apple TV
// 監督 / 出演者 / シリーズ
// Netflix作品ID
//
// =========================================================

export default async function handler(req, res) {

  // =======================================================
  // CORS
  // =======================================================

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
    // 詳細
    // =====================================================

    if (id) {

      return await getMovieDetail(
        id,
        apiKey,
        res
      );

    }


    // =====================================================
    // 検索
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error:
          "映画名を入力してください。"
      });

    }


    return await searchMovies(
      query,
      apiKey,
      res
    );


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

}


// =========================================================
// 映画検索
// =========================================================

async function searchMovies(
  query,
  apiKey,
  res
) {

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

    const errorText =
      await response.text();

    console.error(
      "TMDB SEARCH ERROR:",
      response.status,
      errorText
    );

    return res.status(500).json({
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


  // =====================================================
  // 有効な作品だけ
  // =====================================================

  results =
    results.filter(
      function(movie) {

        return (
          movie &&
          movie.id &&
          (
            movie.title ||
            movie.original_title
          )
        );

      }
    );


  // =====================================================
  // 検索文字列との一致度
  // =====================================================

  const normalizedQuery =
    normalizeTitle(query);


  results.sort(
    function(a, b) {

      const aTitle =
        normalizeTitle(
          a.title ||
          a.original_title ||
          ""
        );

      const bTitle =
        normalizeTitle(
          b.title ||
          b.original_title ||
          ""
        );


      const aExact =
        aTitle === normalizedQuery
          ? 0
          : 1;

      const bExact =
        bTitle === normalizedQuery
          ? 0
          : 1;


      if (aExact !== bExact) {

        return aExact - bExact;

      }


      const aDate =
        isValidDate(a.release_date)
          ? a.release_date
          : "9999-99-99";

      const bDate =
        isValidDate(b.release_date)
          ? b.release_date
          : "9999-99-99";


      return aDate.localeCompare(
        bDate
      );

    }
  );


  // =====================================================
  // 最大10件
  // =====================================================

  results =
    results.slice(0, 10);


  // =====================================================
  // 検索結果
  // =====================================================

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

}


// =========================================================
// 映画詳細
// =========================================================

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

  // =======================================================
  // TMDB作品詳細
  // =======================================================

  const movieUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP";


  const movieResponse =
    await fetch(movieUrl);


  if (!movieResponse.ok) {

    const errorText =
      await movieResponse.text();

    console.error(
      "TMDB MOVIE ERROR:",
      movieResponse.status,
      errorText
    );

    return res.status(404).json({
      error:
        "作品情報を取得できませんでした。"
    });

  }


  const movie =
    await movieResponse.json();


  // =======================================================
  // credits
  // =======================================================

  const creditsUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "/credits" +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP";


  const creditsResponse =
    await fetch(creditsUrl);


  let credits = {};


  if (creditsResponse.ok) {

    credits =
      await creditsResponse.json();

  }


  // =======================================================
  // 日本の配信情報
  // =======================================================

  const providersUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "/watch/providers" +
    "?api_key=" +
    encodeURIComponent(apiKey);


  const providersResponse =
    await fetch(providersUrl);


  let providerData = {};


  if (providersResponse.ok) {

    providerData =
      await providersResponse.json();

  }


  // =======================================================
  // 日本
  // =======================================================

  const jp =
    providerData &&
    providerData.results &&
    providerData.results.JP
      ? providerData.results.JP
      : {};


  const streaming =
    Array.isArray(jp.flatrate)
      ? jp.flatrate
      : [];


  const rental =
    Array.isArray(jp.rent)
      ? jp.rent
      : [];


  const purchase =
    Array.isArray(jp.buy)
      ? jp.buy
      : [];


  // =======================================================
  // 結果オブジェクト
  // =======================================================

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

    original_language:
      movie.original_language || "",

    production_countries:
      Array.isArray(movie.production_countries)
        ? movie.production_countries
        : [],

    director:
      getDirector(credits),

    cast:
      getCast(credits),

    language:
      getLanguageInfo(movie),

    streaming:
      streaming,

    rental:
      rental,

    purchase:
      purchase,

    netflix:
      null,

    netflix_title_id:
      null,

    netflix_id:
      null,

    netflix_url:
      null,

    amazon:
      null,

    amazon_url:
      null,

    unext_url:
      findProviderUrl(
        "unext",
        streaming,
        rental,
        purchase
      ),

    hulu_url:
      findProviderUrl(
        "hulu",
        streaming,
        rental,
        purchase
      ),

    disney_url:
      findProviderUrl(
        "disney",
        streaming,
        rental,
        purchase
      ),

    apple_tv_url:
      findProviderUrl(
        "apple",
        streaming,
        rental,
        purchase
      ),

    link:
      "https://www.themoviedb.org/movie/" +
      movie.id,

    series:
      null

  };


  // =======================================================
  // Netflix
  // =======================================================

  const netflix =
    findProvider(
      "netflix",
      streaming,
      rental,
      purchase
    );


  if (netflix) {

    const netflixUrl =
      normalizeNetflixUrl(
        netflix.provider_url
      );


    if (netflixUrl) {

      const titleId =
        extractNetflixTitleId(
          netflixUrl
        );


      result.netflix = {

        title_id:
          titleId,

        url:
          netflixUrl

      };


      result.netflix_title_id =
        titleId;

      result.netflix_id =
        titleId;

      result.netflix_url =
        netflixUrl;

    } else {

      const fallback =
        createNetflixSearchUrl(
          movie.title ||
          movie.original_title ||
          ""
        );


      result.netflix = {

        title_id:
          null,

        url:
          fallback

      };


      result.netflix_url =
        fallback;

    }

  }


  // =======================================================
  // Amazon Prime Video
  // =======================================================

  const amazon =
    findProvider(
      "amazon",
      streaming,
      rental,
      purchase
    );


  if (amazon) {

    const amazonUrl =
      normalizeAmazonUrl(
        amazon.provider_url
      );


    result.amazon = {

      url:
        amazonUrl ||
        createAmazonSearchUrl(
          movie.title ||
          movie.original_title ||
          ""
        )

    };


    result.amazon_url =
      result.amazon.url;

  }


  // =======================================================
  // TMDB配信ページ
  // =======================================================

  if (
    jp &&
    jp.link
  ) {

    result.link =
      jp.link;

  }


  // =======================================================
  // シリーズ
  // =======================================================

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

}


// =========================================================
// 配信サービス検索
// =========================================================

function findProvider(
  keyword,
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

    const provider =
      all[i];


    if (!provider) {
      continue;
    }


    const name =
      String(
        provider.provider_name ||
        ""
      ).toLowerCase();


    if (
      name.includes(keyword)
    ) {

      return provider;

    }

  }


  return null;

}


// =========================================================
// Netflix URL
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
// Netflix作品ID
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
// Netflix検索
// =========================================================

function createNetflixSearchUrl(
  title
) {

  const clean =
    String(title || "")
      .trim();


  if (!clean) {

    return (
      "https://www.netflix.com/jp/"
    );

  }


  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(clean)
  );

}


// =========================================================
// Amazon URL
// =========================================================

function normalizeAmazonUrl(
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


  if (
    /^https?:\/\/(?:www\.)?amazon\.co\.jp\//i
      .test(clean)
  ) {

    return clean;

  }


  return null;

}


// =========================================================
// Amazon検索
// =========================================================

function createAmazonSearchUrl(
  title
) {

  const clean =
    String(title || "")
      .trim();


  if (!clean) {

    return (
      "https://www.amazon.co.jp/gp/video/storefront"
    );

  }


  return (
    "https://www.amazon.co.jp/s?k=" +
    encodeURIComponent(clean) +
    "&i=instant-video"
  );

}


// =========================================================
// その他サービスURL
// =========================================================

function findProviderUrl(
  keyword,
  streaming,
  rental,
  purchase
) {

  const provider =
    findProvider(
      keyword,
      streaming,
      rental,
      purchase
    );


  if (!provider) {

    return null;

  }


  const urls = [

    provider.provider_url,

    provider.url,

    provider.link

  ];


  for (
    let i = 0;
    i < urls.length;
    i++
  ) {

    if (
      typeof urls[i] === "string" &&
      /^https?:\/\//i.test(
        urls[i]
      )
    ) {

      return urls[i];

    }

  }


  return null;

}


// =========================================================
// 監督
// =========================================================

function getDirector(
  credits
) {

  const crew =
    credits &&
    Array.isArray(credits.crew)
      ? credits.crew
      : [];


  for (
    let i = 0;
    i < crew.length;
    i++
  ) {

    const person =
      crew[i];


    if (
      person &&
      person.job === "Director"
    ) {

      return {

        id:
          person.id,

        name:
          person.name || ""

      };

    }

  }


  return null;

}


// =========================================================
// 出演者
// =========================================================

function getCast(
  credits
) {

  const cast =
    credits &&
    Array.isArray(credits.cast)
      ? credits.cast
      : [];


  return cast
    .slice(0, 10)
    .map(
      function(person) {

        return {

          id:
            person.id,

          name:
            person.name || "",

          character:
            person.character || "",

          profile_path:
            person.profile_path || null

        };

      }
    );

}


// =========================================================
// 字幕・吹き替え
//
// TMDBだけでは日本向けの字幕・吹き替えの
// 正確な有無までは判定できないため、
// 現時点では基本情報を返します。
// =========================================================

function getLanguageInfo(
  movie
) {

  const language =
    movie &&
    movie.original_language
      ? movie.original_language
      : null;


  return {

    original_language:
      language,

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


    let movies =
      Array.isArray(data.parts)
        ? data.parts
        : [];


    // ===================================================
    // 公開日順
    // ===================================================

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


        return dateA.localeCompare(
          dateB
        );

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

              release_year:
                getReleaseYear(
                  movie.release_date
                ),

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
// 公開年
// =========================================================

function getReleaseYear(
  date
) {

  if (
    typeof date !== "string" ||
    !date
  ) {

    return "";

  }


  const match =
    date.match(
      /^(\d{4})/
    );


  if (!match) {

    return "";

  }


  return match[1];

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
