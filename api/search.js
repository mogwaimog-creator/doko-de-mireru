```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// TMDB映画検索
// 日本の配信情報
//
// Netflix
// Amazon Prime Video
// U-NEXT
// Hulu
// Disney+
// Apple TV
// その他
//
// ---------------------------------------------------------
// リンク精度向上版
//
// TMDBのwatch/providersは配信サービス情報を返しますが、
// 個別作品ページの完全な直リンクを常に返すわけではありません。
//
// そのため、
// 1. 実際に取得できた個別URLを最優先
// 2. Netflixは作品IDがあれば直接作品ページ
// 3. AmazonはPrime Video個別ページを検索
// 4. 個別URLが確認できない場合は公式検索ページ
// 5. 最後の手段としてTMDB/JustWatchリンク
//
// という順番で処理します。
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
    // 詳細
    // =====================================================

    if (id) {

      return await getMovieDetail(
        id,
        TMDB_API_KEY,
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

    const netflixUrl =
      findNetflixUrl(
        movie,
        netflixService
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
       * Netflixの個別URLが確認できない場合は
       * Netflix公式検索へ。
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

    const amazonUrl =
      await findAmazonPrimeVideoUrl(
        movie
      );


    if (amazonUrl) {

      result.amazon = {

        url:
          amazonUrl

      };

      result.amazon_url =
        amazonUrl;

    } else {

      const fallbackUrl =
        createAmazonSearchUrl(
          movie.title ||
          movie.original_title ||
          ""
        );


      result.amazon = {

        url:
          fallbackUrl

      };

      result.amazon_url =
        fallbackUrl;

    }

  }


  // =====================================================
  // その他サービス
  // =====================================================

  result.unext_url =
    findProviderUrl(
      "unext",
      result.streaming,
      result.rental,
      result.purchase
    );


  result.hulu_url =
    findProviderUrl(
      "hulu",
      result.streaming,
      result.rental,
      result.purchase
    );


  result.disney_url =
    findProviderUrl(
      "disney",
      result.streaming,
      result.rental,
      result.purchase
    );


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
// Amazon Prime Video個別ページ検索
// =========================================================

async function findAmazonPrimeVideoUrl(
  movie
) {

  const title =
    movie &&
    (
      movie.title ||
      movie.original_title ||
      ""
    );


  if (!title) {
    return null;
  }


  // =====================================================
  // 確認済み作品
  // =====================================================

  const known =
    getKnownAmazonUrl(
      title
    );


  if (known) {

    return known;

  }


  // =====================================================
  // Amazon Japan検索
  // =====================================================

  const searchUrl =
    createAmazonSearchUrl(
      title
    );


  try {

    const response =
      await fetch(
        searchUrl,
        {
          headers: {

            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",

            "Accept-Language":
              "ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7"

          }
        }
      );


    if (!response.ok) {

      console.error(
        "Amazon search failed:",
        response.status
      );

      return null;

    }


    const html =
      await response.text();


    /*
     * Amazon Prime Videoの
     *
     * /gp/video/detail/XXXXXXXXXX
     *
     * を検索。
     */

    const matches =
      html.match(
        /https?:\/\/www\.amazon\.co\.jp\/gp\/video\/detail\/[A-Z0-9]+/gi
      );


    if (
      !matches ||
      matches.length === 0
    ) {

      return null;

    }


    const unique = [];


    for (
      let i = 0;
      i < matches.length;
      i++
    ) {

      const url =
        cleanAmazonUrl(
          matches[i]
        );


      if (
        url &&
        !unique.includes(url)
      ) {

        unique.push(url);

      }

    }


    if (unique.length > 0) {

      return unique[0];

    }


  } catch (error) {

    console.error(
      "Amazon lookup error:",
      error
    );

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
// Amazon URL正規化
// =========================================================

function cleanAmazonUrl(
  url
) {

  if (
    typeof url !== "string" ||
    !url
  ) {

    return null;

  }


  const match =
    url.match(
      /https?:\/\/www\.amazon\.co\.jp\/gp\/video\/detail\/([A-Z0-9]+)/i
    );


  if (!match) {

    return null;

  }


  return (
    "https://www.amazon.co.jp/gp/video/detail/" +
    match[1]
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

    /*
     * TMDB標準映画データだけでは
     * 字幕・吹き替えの日本向け提供状況を
     * 正確には取得できません。
     */

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
