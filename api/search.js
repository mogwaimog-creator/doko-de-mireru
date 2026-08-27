// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版・Netflixリンク改善版
//
// ・映画検索
// ・作品詳細
// ・日本の配信情報
// ・Netflix
// ・Amazon Prime Video
// ・U-NEXT
// ・Hulu
// ・Disney+
// ・Apple TV
// ・監督
// ・出演者
// ・シリーズ
//
// TMDB APIを利用
// =========================================================


module.exports = async function handler(req, res) {

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
    //
    // /api/search?id=519182
    // =====================================================

    if (id) {

      const movie =
        await getMovieDetail(
          id,
          apiKey
        );


      return res.status(200).json(
        movie
      );

    }


    // =====================================================
    // 検索文字チェック
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error:
          "映画名を入力してください。"
      });

    }


    // =====================================================
    // TMDB映画検索
    // =====================================================

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
      await fetchJson(
        searchUrl
      );


    let movies =
      Array.isArray(data.results)
        ? data.results
        : [];


    // =====================================================
    // 不正データ除外
    // =====================================================

    movies =
      movies.filter(function(movie) {

        return (
          movie &&
          movie.id &&
          movie.title
        );

      });


    // =====================================================
    // 完全一致を優先
    // =====================================================

    const normalizedQuery =
      normalizeTitle(
        query
      );


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


      if (
        aExact !== bExact
      ) {

        return (
          aExact -
          bExact
        );

      }


      return (
        Number(
          b.vote_average || 0
        ) -
        Number(
          a.vote_average || 0
        )
      );

    });


    // =====================================================
    // 最大10件
    // =====================================================

    movies =
      movies.slice(
        0,
        10
      );


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
            Number(
              movie.vote_average || 0
            )

        };

      });


    return res.status(200).json({
      results:
        results
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

  // =======================================================
  // 作品情報
  // =======================================================

  const movieUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&append_to_response=credits";


  const movie =
    await fetchJson(
      movieUrl
    );


  // =======================================================
  // 日本の配信情報
  //
  // 配信情報だけ失敗しても
  // 作品詳細ページ全体は表示する
  // =======================================================

  let providersJP = {};


  try {

    const providerUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "/watch/providers" +
      "?api_key=" +
      encodeURIComponent(apiKey);


    const providerData =
      await fetchJson(
        providerUrl
      );


    if (
      providerData &&
      providerData.results &&
      providerData.results.JP
    ) {

      providersJP =
        providerData.results.JP;

    }

  } catch (error) {

    console.error(
      "WATCH PROVIDERS ERROR:",
      error
    );

    providersJP = {};

  }


  // =======================================================
  // 配信情報
  // =======================================================

  const streaming =
    normalizeProviders(
      providersJP.flatrate
    );


  const rental =
    normalizeProviders(
      providersJP.rent
    );


  const purchase =
    normalizeProviders(
      providersJP.buy
    );


  // =======================================================
  // タイトル
  // =======================================================

  const title =
    movie.title ||
    movie.original_title ||
    "";


  // =======================================================
  // サービス検索
  // =======================================================

  const netflixProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "netflix"
      ]
    );


  const amazonProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "amazon"
      ]
    );


  const unextProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "u-next",
        "unext"
      ]
    );


  const huluProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "hulu"
      ]
    );


  const disneyProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "disney"
      ]
    );


  const appleProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "apple"
      ]
    );


  // =======================================================
  // Netflix URL
  //
  // まず作品ID付きURLを探す。
  // なければNetflix検索へ。
  // =======================================================

  const netflixInfo =
    await createNetflixUrl(
      movie,
      netflixProvider,
      title,
      apiKey
    );


  // =======================================================
  // Amazon
  // =======================================================

  const amazonUrl =
  amazonProvider
    ? createAmazonUrl(
        amazonProvider,
        title
      )
    : null;


  // =======================================================
  // U-NEXT
  // =======================================================

  const unextUrl =
    unextProvider
      ? createUnextUrl(
          title
        )
      : null;


  // =======================================================
  // Hulu
  // =======================================================

  const huluUrl =
    huluProvider
      ? createHuluUrl(
          title
        )
      : null;


  // =======================================================
  // Disney+
  // =======================================================

  const disneyUrl =
    disneyProvider
      ? createDisneyUrl(
          title
        )
      : null;


  // =======================================================
  // Apple TV
  // =======================================================

  const appleUrl =
    appleProvider
      ? createAppleUrl(
          title
        )
      : null;


  // =======================================================
  // 監督
  // =======================================================

  const director =
    getDirector(
      movie
    );


  // =======================================================
  // 出演者
  // =======================================================

  const cast =
    getCast(
      movie
    );


  // =======================================================
  // シリーズ
  // =======================================================

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


  // =======================================================
  // TMDB配信ページ
  // =======================================================

  const tmdbWatchLink =
    providersJP.link ||
    (
      "https://www.themoviedb.org/movie/" +
      movie.id +
      "/watch?locale=JP"
    );


  // =======================================================
  // 完成データ
  // =======================================================

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


    // =====================================================
    // 監督
    // =====================================================

    director:
      director,


    // =====================================================
    // 出演者
    // =====================================================

    cast:
      cast,


    // =====================================================
    // 配信
    // =====================================================

    streaming:
      streaming,

    rental:
      rental,

    purchase:
      purchase,


    // =====================================================
    // Netflix
    // =====================================================

    netflix:
      netflixProvider
        ? {
            url:
              netflixInfo.url,

            direct:
              netflixInfo.direct,

            title_id:
              netflixInfo.title_id
          }
        : null,

    netflix_url:
      netflixProvider
        ? netflixInfo.url
        : null,

    netflix_title_id:
      netflixProvider
        ? netflixInfo.title_id
        : null,

    netflix_id:
      netflixProvider
        ? netflixInfo.title_id
        : null,


    // =====================================================
    // Amazon
    // =====================================================

    amazon:
      amazonProvider
        ? {
            url:
              amazonUrl
          }
        : null,

    amazon_url:
      amazonUrl,


    // =====================================================
    // U-NEXT
    // =====================================================

    unext_url:
      unextUrl,


    // =====================================================
    // Hulu
    // =====================================================

    hulu_url:
      huluUrl,


    // =====================================================
    // Disney+
    // =====================================================

    disney_url:
      disneyUrl,


    // =====================================================
    // Apple TV
    // =====================================================

    apple_tv_url:
      appleUrl,


    // =====================================================
    // シリーズ
    // =====================================================

    series:
      series,


    // =====================================================
    // TMDB
    // =====================================================

    link:
      tmdbWatchLink

  };

}


// =========================================================
// Netflix URL作成
// =========================================================
//
// TMDBのWatch Provider APIはNetflixの完全な作品URLを
// 必ず返すわけではない。
// そのため以下の順番で処理する。
//
// ① providerにNetflix作品URLが存在
// ② provider情報内にNetflix IDが存在
// ③ movie.external_ids にNetflix IDが存在
// ④ 取得できなければNetflix検索ページ
//
// =========================================================

async function createNetflixUrl(
  movie,
  provider,
  title,
  apiKey
) {

  // -------------------------------------------------------
  // ① provider情報から直接取得
  // -------------------------------------------------------

  const directFromProvider =
    findNetflixUrlInProvider(
      provider
    );


  if (
    directFromProvider
  ) {

    return {

      url:
        directFromProvider,

      direct:
        true,

      title_id:
        extractNetflixId(
          directFromProvider
        )

    };

  }


  // -------------------------------------------------------
  // ② provider情報にIDがある場合
  // -------------------------------------------------------

  const providerId =
    extractNetflixIdFromObject(
      provider
    );


  if (providerId) {

    return {

      url:
        buildNetflixTitleUrl(
          providerId
        ),

      direct:
        true,

      title_id:
        providerId

    };

  }


  // -------------------------------------------------------
  // ③ TMDB external_idsから取得
  //
  // TMDBの通常movie detailでは
  // external_idsをappendしていないため、
  // ここで追加取得する。
  // -------------------------------------------------------

  try {

    const externalUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movie.id) +
      "/external_ids" +
      "?api_key=" +
      encodeURIComponent(apiKey);


    const externalIds =
      await fetchJson(
        externalUrl
      );


    const netflixId =
      extractNetflixIdFromExternalIds(
        externalIds
      );


    if (netflixId) {

      return {

        url:
          buildNetflixTitleUrl(
            netflixId
          ),

        direct:
          true,

        title_id:
          netflixId

      };

    }

  } catch (error) {

    // Netflix ID取得失敗だけで
    // 作品詳細をエラーにしない

    console.error(
      "NETFLIX EXTERNAL IDS ERROR:",
      error
    );

  }


  // -------------------------------------------------------
  // ④ 最後はNetflix検索
  // -------------------------------------------------------

  return {

    url:
      "https://www.netflix.com/jp/search?q=" +
      encodeURIComponent(
        title
      ),

    direct:
      false,

    title_id:
      null

  };

}


// =========================================================
// Netflix providerからURLを探す
// =========================================================

function findNetflixUrlInProvider(
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

      return buildNetflixTitleUrl(
        id
      );

    }

  }


  return null;

}


// =========================================================
// Netflix ID抽出
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
// オブジェクトからNetflix IDを探す
// =========================================================

function extractNetflixIdFromObject(
  object
) {

  if (!object) {

    return null;

  }


  const keys = [

    "netflix_id",

    "netflix_title_id",

    "title_id",

    "external_id",

    "externalId"

  ];


  for (
    let i = 0;
    i < keys.length;
    i++
  ) {

    const value =
      object[keys[i]];


    if (
      value !== undefined &&
      value !== null
    ) {

      const id =
        String(value)
          .match(/^\d+$/);


      if (id) {

        return id[0];

      }

    }

  }


  return null;

}


// =========================================================
// external_idsからNetflix ID
// =========================================================

function extractNetflixIdFromExternalIds(
  externalIds
) {

  if (
    !externalIds
  ) {

    return null;

  }


  const candidates = [

    externalIds.netflix_id,

    externalIds.netflix,

    externalIds.netflix_title_id

  ];


  for (
    let i = 0;
    i < candidates.length;
    i++
  ) {

    const value =
      candidates[i];


    if (
      value === undefined ||
      value === null
    ) {

      continue;

    }


    const match =
      String(value)
        .match(/\d+/);


    if (match) {

      return match[0];

    }

  }


  return null;

}


// =========================================================
// Netflix作品URL
// =========================================================

function buildNetflixTitleUrl(
  netflixId
) {

  return (
    "https://www.netflix.com/jp/title/" +
    encodeURIComponent(
      netflixId
    )
  );

}


// =========================================================
// Amazon Prime Video
// =========================================================

function createAmazonUrl(
  provider,
  title
) {

  // -------------------------------------------------------
  // Amazonの直接URLが取得できている場合
  // -------------------------------------------------------

  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    ) &&
    /amazon\./i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }


  // -------------------------------------------------------
  // 直接URLが取得できない場合
  // Amazon検索ページへ
  // -------------------------------------------------------

  return (
    "https://www.amazon.co.jp/s" +
    "?k=" +
    encodeURIComponent(
      title
    ) +
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
    encodeURIComponent(
      title
    )
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
    encodeURIComponent(
      title
    )
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
    encodeURIComponent(
      title
    )
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
    encodeURIComponent(
      title
    )
  );

}


// =========================================================
// 配信サービス正規化
// =========================================================

function normalizeProviders(
  providers
) {

  if (
    !Array.isArray(
      providers
    )
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

  const all =
    []
      .concat(
        streaming || []
      )
      .concat(
        rental || []
      )
      .concat(
        purchase || []
      );


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
    .slice(
      0,
      8
    )
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
      encodeURIComponent(
        collectionId
      ) +
      "?api_key=" +
      encodeURIComponent(
        apiKey
      ) +
      "&language=ja-JP";


    const data =
      await fetchJson(
        url
      );


    let movies =
      Array.isArray(
        data.parts
      )
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
              movie.poster_path ||
              null

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
// JSON取得
// =========================================================

async function fetchJson(
  url
) {

  const response =
    await fetch(
      url,
      {
        method:
          "GET",

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
      JSON.parse(
        text
      );

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
