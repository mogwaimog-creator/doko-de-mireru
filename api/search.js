```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// TMDB映画検索 + 詳細情報 + 日本の配信情報
//
// Netflix
// Amazon Prime Video
// U-NEXT
// Hulu
// Disney+
// Apple TV
//
// 別ページ方式 detail.html 対応
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
    // 作品詳細
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
  // 完全一致を優先
  // =====================================================

  const normalizedQuery =
    normalizeTitle(query);


  results.sort(
    function(a, b) {

      const aTitle =
        normalizeTitle(
          a.title || ""
        );

      const bTitle =
        normalizeTitle(
          b.title || ""
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


      return String(
        a.release_date || "9999-99-99"
      ).localeCompare(
        String(
          b.release_date || "9999-99-99"
        )
      );

    }
  );


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

}


// =========================================================
// 映画詳細
// =========================================================

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

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

    origin_country:
      getOriginCountry(movie),

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

    amazon:
      null,

    amazon_url:
      null,

    unext_url:
      null,

    hulu_url:
      null,

    disney_url:
      null,

    apple_tv_url:
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

  const netflixService =
    findNetflixService(
      result.streaming,
      result.rental,
      result.purchase
    );


  if (netflixService) {

    /*
     * TMDBから取得できるURLを確認
     */

    const netflixUrl =
      findNetflixUrl(
        movie,
        netflixService,
        providers
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

      /*
       * 個別作品IDが分からない場合
       *
       * Netflixホームではなく
       * Netflix検索ページへ。
       */

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


  // =====================================================
  // Amazon Prime Video
  // =====================================================

  const amazonService =
    findAmazonService(
      result.streaming,
      result.rental,
      result.purchase
    );


  if (amazonService) {

    /*
     * まず既知の確実なURLを確認
     */

    let amazonUrl =
      getKnownAmazonUrl(
        movie.title ||
        movie.original_title ||
        ""
      );


    /*
     * 既知URLがなければ
     * TMDB側のURLを確認
     */

    if (!amazonUrl) {

      amazonUrl =
        findAmazonUrlFromProvider(
          amazonService
        );

    }


    /*
     * 個別URLが取得できない場合
     *
     * Amazon検索へ。
     */

    if (!amazonUrl) {

      amazonUrl =
        createAmazonSearchUrl(
          movie.title ||
          movie.original_title ||
          ""
        );

    }


    result.amazon = {

      url:
        amazonUrl

    };


    result.amazon_url =
      amazonUrl;

  }


  // =====================================================
  // U-NEXT
  // =====================================================

  result.unext_url =
    findProviderUrl(
      "unext",
      result.streaming,
      result.rental,
      result.purchase
    );


  // =====================================================
  // Hulu
  // =====================================================

  result.hulu_url =
    findProviderUrl(
      "hulu",
      result.streaming,
      result.rental,
      result.purchase
    );


  // =====================================================
  // Disney+
  // =====================================================

  result.disney_url =
    findProviderUrl(
      "disney",
      result.streaming,
      result.rental,
      result.purchase
    );


  // =====================================================
  // Apple TV
  // =====================================================

  result.apple_tv_url =
    findProviderUrl(
      "apple",
      result.streaming,
      result.rental,
      result.purchase
    );


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

}


// =========================================================
// Amazonサービス判定
// =========================================================

function findAmazonService(
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
      name.includes("amazon") ||
      name.includes("prime video") ||
      name.includes("amazon video")
    ) {

      return service;

    }

  }


  return null;

}


// =========================================================
// Amazon URL
// =========================================================

function findAmazonUrlFromProvider(
  service
) {

  if (!service) {
    return null;
  }


  const urls = [

    service.provider_url,

    service.watch_link,

    service.url,

    service.link

  ];


  for (
    let i = 0;
    i < urls.length;
    i++
  ) {

    const url =
      urls[i];


    if (
      typeof url === "string" &&
      /^https?:\/\//i.test(url)
    ) {

      if (
        /amazon\.co\.jp/i.test(url) ||
        /primevideo\.com/i.test(url)
      ) {

        return url;

      }

    }

  }


  return null;

}


// =========================================================
// 確認済みAmazon作品
// =========================================================

function getKnownAmazonUrl(
  title
) {

  const normalized =
    normalizeTitle(
      title
    );


  /*
   * 怪盗グルーのミニオン超変身
   */

  if (
    normalized ===
    normalizeTitle(
      "怪盗グルーのミニオン超変身"
    )
  ) {

    return (
      "https://www.amazon.co.jp/gp/video/detail/B0D6VX533G"
    );

  }


  return null;

}


// =========================================================
// Amazon検索URL
// =========================================================

function createAmazonSearchUrl(
  title
) {

  const cleanTitle =
    String(
      title || ""
    ).trim();


  if (!cleanTitle) {

    return (
      "https://www.amazon.co.jp/gp/video/storefront"
    );

  }


  return (
    "https://www.amazon.co.jp/s?k=" +
    encodeURIComponent(
      cleanTitle
    ) +
    "&i=instant-video"
  );

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
  service,
  providers
) {

  const urls = [

    /*
     * まず作品側
     */

    movie &&
    movie.netflix_url,

    movie &&
    movie.netflix_link,

    /*
     * 配信情報
     */

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

    /*
     * providers
     */

    providers &&
    providers.link

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

    /netflix\.com\/(?:jp\/)?(?:[^/]+\/)?title\/(\d+)/i,

    /netflix\.com\/(?:jp\/)?(?:[^/]+\/)?watch\/(\d+)/i,

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


  /*
   * Netflix公式URLなら使用
   */

  if (
    /^https?:\/\/(?:www\.)?netflix\.com\//i
      .test(clean)
  ) {

    return clean;

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

    return (
      "https://www.netflix.com/jp/"
    );

  }


  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(
      cleanTitle
    )
  );

}


// =========================================================
// その他配信サービスURL
// =========================================================

function findProviderUrl(
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
        provider.name ||
        ""
      ).toLowerCase();


    if (
      !name.includes(keyword)
    ) {

      continue;

    }


    const urls = [

      provider.provider_url,

      provider.watch_link,

      provider.url,

      provider.link

    ];


    for (
      let j = 0;
      j < urls.length;
      j++
    ) {

      if (
        typeof urls[j] === "string" &&
        /^https?:\/\//i.test(
          urls[j]
        )
      ) {

        return urls[j];

      }

    }

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
// 原産国
// =========================================================

function getOriginCountry(
  movie
) {

  const countries =
    Array.isArray(
      movie.production_countries
    )
      ? movie.production_countries
      : [];


  if (!countries.length) {
    return [];
  }


  return countries.map(
    function(country) {

      return {

        iso_3166_1:
          country.iso_3166_1 || "",

        name:
          country.name || ""

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
```
