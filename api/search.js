```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版
//
// ・TMDB映画検索
// ・映画詳細
// ・日本の配信情報
// ・Netflix
// ・Amazon Prime Video
// ・U-NEXT
// ・Hulu
// ・Disney+
// ・Apple TV
// ・シリーズ
// ・監督
// ・出演者
//
// Vercel Serverless Function 対応
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

    const apiKey =
      process.env.TMDB_API_KEY;

    if (!apiKey) {

      return res.status(500).json({
        error:
          "TMDB_API_KEY がVercelに設定されていません。"
      });

    }


    // =====================================================
    // パラメータ
    // =====================================================

    const queryParams =
      req.query || {};

    const query =
      typeof queryParams.query === "string"
        ? queryParams.query.trim()
        : "";

    const id =
      typeof queryParams.id === "string"
        ? queryParams.id.trim()
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

    const text =
      await response.text();

    console.error(
      "TMDB SEARCH ERROR:",
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


  // =====================================================
  // 映画だけ
  // =====================================================

  results =
    results.filter(
      function(movie) {

        return (
          movie &&
          movie.id
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


      return (
        String(
          a.release_date || "9999"
        )
        .localeCompare(
          String(
            b.release_date || "9999"
          )
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
            Number(
              movie.vote_average || 0
            )

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
      "TMDB DETAIL ERROR:",
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
  // Netflix
  // =====================================================

  const netflix =
    findProvider(
      "netflix",
      streaming,
      rental,
      purchase
    );


  let netflixUrl =
    null;


  let netflixTitleId =
    null;


  if (netflix) {

    netflixTitleId =
      extractNetflixTitleId(
        netflix.provider_url
      );


    if (netflixTitleId) {

      netflixUrl =
        "https://www.netflix.com/jp/title/" +
        encodeURIComponent(
          netflixTitleId
        );

    } else {

      netflixUrl =
        createNetflixSearchUrl(
          movie.title ||
          movie.original_title ||
          ""
        );

    }

  }


  // =====================================================
  // Amazon
  // =====================================================

  const amazon =
    findProvider(
      "amazon",
      streaming,
      rental,
      purchase
    ) ||
    findProvider(
      "prime video",
      streaming,
      rental,
      purchase
    );


  let amazonUrl =
    null;


  if (amazon) {

    /*
     * TMDBから個別Amazon URLが返る場合は使用
     */

    if (
      typeof amazon.provider_url === "string" &&
      /^https?:\/\//i.test(
        amazon.provider_url
      )
    ) {

      amazonUrl =
        amazon.provider_url;

    } else {

      amazonUrl =
        createAmazonSearchUrl(
          movie.title ||
          movie.original_title ||
          ""
        );

    }

  }


  // =====================================================
  // その他
  // =====================================================

  const unext =
    findProvider(
      "unext",
      streaming,
      rental,
      purchase
    );


  const hulu =
    findProvider(
      "hulu",
      streaming,
      rental,
      purchase
    );


  const disney =
    findProvider(
      "disney",
      streaming,
      rental,
      purchase
    );


  const apple =
    findProvider(
      "apple",
      streaming,
      rental,
      purchase
    );


  // =====================================================
  // 結果
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
      Number(
        movie.vote_average || 0
      ),

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

    streaming:
      streaming,

    rental:
      rental,

    purchase:
      purchase,

    link:
      providers.link ||
      (
        "https://www.themoviedb.org/movie/" +
        movie.id
      ),

    netflix:
      netflix
        ? {
            title_id:
              netflixTitleId,
            url:
              netflixUrl
          }
        : null,

    netflix_title_id:
      netflixTitleId,

    netflix_id:
      netflixTitleId,

    netflix_url:
      netflixUrl,

    amazon:
      amazon
        ? {
            url:
              amazonUrl
          }
        : null,

    amazon_url:
      amazonUrl,

    unext_url:
      getProviderLink(unext),

    hulu_url:
      getProviderLink(hulu),

    disney_url:
      getProviderLink(disney),

    apple_tv_url:
      getProviderLink(apple),

    series:
      null

  };


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
// 配信サービス検索
// =========================================================

function findProvider(
  keyword,
  streaming,
  rental,
  purchase
) {

  const all =
    []
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
        provider.provider_name || ""
      )
      .toLowerCase();


    if (
      name.includes(
        String(keyword).toLowerCase()
      )
    ) {

      return provider;

    }

  }


  return null;

}


// =========================================================
// その他サービスURL
// =========================================================

function getProviderLink(
  provider
) {

  if (!provider) {
    return null;
  }


  if (
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }


  return null;

}


// =========================================================
// Netflix ID
// =========================================================

function extractNetflixTitleId(
  url
) {

  if (
    typeof url !== "string"
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
    String(
      title || ""
    ).trim();


  if (!clean) {

    return "https://www.netflix.com/jp/";

  }


  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(clean)
  );

}


// =========================================================
// Amazon検索
// =========================================================

function createAmazonSearchUrl(
  title
) {

  const clean =
    String(
      title || ""
    ).trim();


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


  const director =
    crew.find(
      function(person) {

        return (
          person &&
          person.job === "Director"
        );

      }
    );


  if (!director) {
    return null;
  }


  return {

    id:
      director.id,

    name:
      director.name || ""

  };

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
      movie.original_language ||
      null,

    subtitle:
      null,

    dubbing:
      null

  };

}


// =========================================================
// シリーズ
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


    movies.sort(
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
```
