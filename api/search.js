```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// Vercel安定版
// =========================================================

module.exports = async function handler(req, res) {

  // -------------------------------------------------------
  // CORS
  // -------------------------------------------------------

  res.setHeader("Access-Control-Allow-Origin", "*");
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

    // -----------------------------------------------------
    // API KEY
    // -----------------------------------------------------

    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {

      return res.status(500).json({
        error: "TMDB_API_KEY が設定されていません。"
      });

    }


    // -----------------------------------------------------
    // パラメータ
    // -----------------------------------------------------

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


    // -----------------------------------------------------
    // 作品詳細
    // -----------------------------------------------------

    if (id) {

      const movie =
        await getMovieDetail(
          id,
          apiKey
        );

      return res.status(200).json(movie);

    }


    // -----------------------------------------------------
    // 検索文字チェック
    // -----------------------------------------------------

    if (!query) {

      return res.status(400).json({
        error: "映画名を入力してください。"
      });

    }


    // -----------------------------------------------------
    // TMDB映画検索
    // -----------------------------------------------------

    const searchUrl =
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
      await requestJson(searchUrl);


    let movies =
      Array.isArray(data.results)
        ? data.results
        : [];


    // -----------------------------------------------------
    // 不正データ除外
    // -----------------------------------------------------

    movies =
      movies.filter(function(movie) {

        return (
          movie &&
          movie.id &&
          movie.title
        );

      });


    // -----------------------------------------------------
    // 完全一致を優先
    // -----------------------------------------------------

    const normalizedQuery =
      normalizeTitle(query);


    movies.sort(function(a, b) {

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


      const ratingA =
        Number(a.vote_average || 0);

      const ratingB =
        Number(b.vote_average || 0);


      return ratingB - ratingA;

    });


    // -----------------------------------------------------
    // 最大10件
    // -----------------------------------------------------

    movies =
      movies.slice(0, 10);


    // -----------------------------------------------------
    // 検索結果
    // -----------------------------------------------------

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
          : "サーバーでエラーが発生しました。"

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

  const url =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&append_to_response=credits,watch/providers";


  const movie =
    await requestJson(url);


  // -------------------------------------------------------
  // 日本の配信情報
  // -------------------------------------------------------

  const watch =
    movie &&
    movie["watch/providers"]
      ? movie["watch/providers"]
      : null;


  const providers =
    watch &&
    watch.results &&
    watch.results.JP
      ? watch.results.JP
      : {};


  const streaming =
    normalizeProviders(
      providers.flatrate
    );


  const rental =
    normalizeProviders(
      providers.rent
    );


  const purchase =
    normalizeProviders(
      providers.buy
    );


  // -------------------------------------------------------
  // サービス検索
  // -------------------------------------------------------

  const title =
    movie.title ||
    movie.original_title ||
    "";


  const netflixProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      ["netflix"]
    );


  const amazonProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      ["amazon"]
    );


  const unextProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      ["u-next", "unext"]
    );


  const huluProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      ["hulu"]
    );


  const disneyProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      ["disney"]
    );


  const appleProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      ["apple"]
    );


  // -------------------------------------------------------
  // Netflix URL
  // -------------------------------------------------------

  const netflixUrl =
    netflixProvider
      ? createNetflixUrl(
          netflixProvider,
          title
        )
      : null;


  // -------------------------------------------------------
  // Amazon URL
  // -------------------------------------------------------

  const amazonUrl =
    amazonProvider
      ? createAmazonUrl(
          amazonProvider,
          title
        )
      : null;


  // -------------------------------------------------------
  // その他URL
  // -------------------------------------------------------

  const unextUrl =
    unextProvider
      ? createUnextUrl(
          unextProvider,
          title
        )
      : null;


  const huluUrl =
    huluProvider
      ? createHuluUrl(
          huluProvider,
          title
        )
      : null;


  const disneyUrl =
    disneyProvider
      ? createDisneyUrl(
          disneyProvider,
          title
        )
      : null;


  const appleUrl =
    appleProvider
      ? createAppleUrl(
          appleProvider,
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


  // -------------------------------------------------------
  // TMDB
  // -------------------------------------------------------

  const tmdbLink =
    providers.link ||
    (
      "https://www.themoviedb.org/movie/" +
      movie.id +
      "?language=ja-JP"
    );


  // -------------------------------------------------------
  // 結果
  // -------------------------------------------------------

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


    // ---------------------------------------------------
    // Netflix
    // ---------------------------------------------------

    netflix:
      netflixProvider
        ? {
            url: netflixUrl
          }
        : null,

    netflix_url:
      netflixUrl,

    netflix_title_id:
      extractNetflixId(
        netflixUrl
      ),

    netflix_id:
      extractNetflixId(
        netflixUrl
      ),


    // ---------------------------------------------------
    // Amazon
    // ---------------------------------------------------

    amazon:
      amazonProvider
        ? {
            url: amazonUrl
          }
        : null,

    amazon_url:
      amazonUrl,


    // ---------------------------------------------------
    // その他
    // ---------------------------------------------------

    unext_url:
      unextUrl,

    hulu_url:
      huluUrl,

    disney_url:
      disneyUrl,

    apple_tv_url:
      appleUrl,


    // ---------------------------------------------------
    // シリーズ
    // ---------------------------------------------------

    series:
      series,


    // ---------------------------------------------------
    // TMDB
    // ---------------------------------------------------

    link:
      tmdbLink

  };

}


// =========================================================
// HTTP JSON取得
// =========================================================

async function requestJson(url) {

  const response =
    await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });


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

    const message =
      data &&
      data.status_message
        ? data.status_message
        : "TMDB API ERROR " +
          response.status;


    throw new Error(message);

  }


  return data;

}


// =========================================================
// 配信サービス正規化
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
// 配信サービス検索
// =========================================================

function findProvider(
  streaming,
  rental,
  purchase,
  keywords
) {

  const all = []
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
// Netflix URL
// =========================================================

function createNetflixUrl(
  provider,
  title
) {

  // TMDBのリンクにNetflix作品URLが入っている場合
  const direct =
    getNetflixDirectUrl(
      provider
    );


  if (direct) {

    return direct;

  }


  // それ以外はNetflix日本版検索
  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(
      title
    )
  );

}


// =========================================================
// Netflix作品ID抽出
// =========================================================

function getNetflixDirectUrl(
  provider
) {

  if (!provider) {

    return null;

  }


  const urls = [

    provider.url,
    provider.link,
    provider.watch_link,
    provider.provider_url

  ];


  for (
    let i = 0;
    i < urls.length;
    i++
  ) {

    const url =
      urls[i];


    if (
      typeof url !== "string"
    ) {

      continue;

    }


    const id =
      extractNetflixId(
        url
      );


    if (id) {

      return (
        "https://www.netflix.com/jp/title/" +
        id
      );

    }

  }


  return null;

}


// =========================================================
// Netflix ID
// =========================================================

function extractNetflixId(
  url
) {

  if (
    typeof url !== "string"
  ) {

    return null;

  }


  const patterns = [

    /netflix\.com\/[^/]*\/title\/(\d+)/i,

    /netflix\.com\/title\/(\d+)/i,

    /netflix\.com\/[^/]*\/watch\/(\d+)/i,

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
// Amazon URL
// =========================================================

function createAmazonUrl(
  provider,
  title
) {

  const direct =
    getAmazonDirectUrl(
      provider
    );


  if (direct) {

    return direct;

  }


  return (
    "https://www.amazon.co.jp/s?k=" +
    encodeURIComponent(title) +
    "&i=instant-video"
  );

}


// =========================================================
// Amazon直接URL
// =========================================================

function getAmazonDirectUrl(
  provider
) {

  if (!provider) {

    return null;

  }


  const urls = [

    provider.url,
    provider.link,
    provider.watch_link,
    provider.provider_url

  ];


  for (
    let i = 0;
    i < urls.length;
    i++
  ) {

    const url =
      urls[i];


    if (
      typeof url !== "string"
    ) {

      continue;

    }


    if (
      /amazon\.[^/]+\/gp\/video\/detail\//i.test(
        url
      )
    ) {

      return url;

    }


    if (
      /amazon\.[^/]+\/.*video/i.test(
        url
      )
    ) {

      return url;

    }

  }


  return null;

}


// =========================================================
// U-NEXT URL
// =========================================================

function createUnextUrl(
  provider,
  title
) {

  /*
   * TMDBのprovider_urlが
   * U-NEXT自身のページの場合は使用。
   */

  if (
    provider &&
    isHttpUrl(
      provider.provider_url
    ) &&
    /u-next/i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }


  /*
   * U-NEXT検索
   */

  return (
    "https://video.unext.jp/search/" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Hulu URL
// =========================================================

function createHuluUrl(
  provider,
  title
) {

  if (
    provider &&
    isHttpUrl(
      provider.provider_url
    ) &&
    /hulu/i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }


  return (
    "https://www.hulu.jp/search?q=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Disney+ URL
// =========================================================

function createDisneyUrl(
  provider,
  title
) {

  if (
    provider &&
    isHttpUrl(
      provider.provider_url
    ) &&
    /disney/i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }


  return (
    "https://www.disneyplus.com/ja-jp/search/" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Apple TV URL
// =========================================================

function createAppleUrl(
  provider,
  title
) {

  if (
    provider &&
    isHttpUrl(
      provider.provider_url
    ) &&
    /apple/i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }


  return (
    "https://tv.apple.com/jp/search?term=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// URLチェック
// =========================================================

function isHttpUrl(
  url
) {

  return (
    typeof url === "string" &&
    /^https?:\/\//i.test(url)
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
      await requestJson(url);


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
```
