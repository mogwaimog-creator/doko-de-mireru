```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// 無料視聴強化・ABEMA対応・整理済み完成版
//
// ・映画検索
// ・作品詳細
// ・日本の配信情報
// ・見放題
// ・レンタル
// ・購入
// ・無料視聴
// ・広告付き無料
// ・ABEMA
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
// 無料視聴
// TMDBの free + ads を無料視聴として扱う。
//
// ABEMA
// TMDBの配信情報にABEMAが含まれている場合、
// ABEMAとして認識する。
//
// 注意
// ABEMAの無料/有料状態は作品ごと・時期ごとに変わるため、
// TMDBに無料情報がない作品を勝手に「無料」とは判定しない。
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
    // 検索結果
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
  // 見放題
  // =======================================================

  const streaming =
    normalizeProviders(
      providersJP.flatrate
    );


  // =======================================================
  // レンタル
  // =======================================================

  const rental =
    normalizeProviders(
      providersJP.rent
    );


  // =======================================================
  // 購入
  // =======================================================

  const purchase =
    normalizeProviders(
      providersJP.buy
    );


  // =======================================================
  // 無料視聴
  //
  // free
  // ↓
  // 完全無料
  //
  // ads
  // ↓
  // 広告付き無料
  //
  // 両方を「無料視聴」として表示。
  // =======================================================

  const freeProviders = [];


  if (
    Array.isArray(
      providersJP.free
    )
  ) {

    freeProviders.push(
      ...providersJP.free
    );

  }


  if (
    Array.isArray(
      providersJP.ads
    )
  ) {

    freeProviders.push(
      ...providersJP.ads
    );

  }


  const free =
    normalizeProviders(
      freeProviders
    );


  // =======================================================
  // 無料視聴重複除去
  // =======================================================

  const freeUnique =
    uniqueProviders(
      free
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
      freeUnique,
      [
        "netflix"
      ]
    );


  const amazonProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      freeUnique,
      [
        "amazon",
        "prime video"
      ]
    );


  const unextProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      freeUnique,
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
      freeUnique,
      [
        "hulu"
      ]
    );


  const disneyProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      freeUnique,
      [
        "disney"
      ]
    );


  const appleProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      freeUnique,
      [
        "apple"
      ]
    );


  const abemaProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      freeUnique,
      [
        "abema"
      ]
    );


  // =======================================================
  // Netflix URL
  // =======================================================

  const netflixUrl =
    netflixProvider
      ? "https://www.netflix.com/jp/"
      : null;


  // =======================================================
  // Amazon URL
  // =======================================================

  const amazonUrl =
    amazonProvider
      ? createAmazonUrl(
          amazonProvider,
          title
        )
      : null;


  // =======================================================
  // U-NEXT URL
  // =======================================================

  const unextUrl =
    unextProvider
      ? createUnextUrl(
          title
        )
      : null;


  // =======================================================
  // Hulu URL
  // =======================================================

  const huluUrl =
    huluProvider
      ? createHuluUrl(
          title
        )
      : null;


  // =======================================================
  // Disney+ URL
  // =======================================================

  const disneyUrl =
    disneyProvider
      ? createDisneyUrl(
          title
        )
      : null;


  // =======================================================
  // Apple TV URL
  // =======================================================

  const appleUrl =
    appleProvider
      ? createAppleUrl(
          title
        )
      : null;


  // =======================================================
  // ABEMA URL
  // =======================================================

  const abemaUrl =
    abemaProvider
      ? createAbemaUrl(
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
    // 無料視聴
    // =====================================================

    free:
      freeUnique,


    // =====================================================
    // Netflix
    // =====================================================

    netflix:
      netflixProvider
        ? {
            url:
              netflixUrl,

            direct:
              false,

            title_id:
              null
          }
        : null,

    netflix_url:
      netflixUrl,

    netflix_title_id:
      null,

    netflix_id:
      null,


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
    // ABEMA
    // =====================================================

    abema:
      abemaProvider
        ? {
            url:
              abemaUrl,

            free:
              freeUnique.some(
                function(provider) {

                  return (
                    normalizeProviderKey(
                      provider.provider_name
                    ) === "abema"
                  );

                }
              )
          }
        : null,

    abema_url:
      abemaUrl,


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
// Amazon Prime Video
// =========================================================

function createAmazonUrl(
  provider,
  title
) {

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
    "https://video.unext.jp/"
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
// ABEMA
// =========================================================

function createAbemaUrl(
  title
) {

  return (
    "https://abema.tv/search?q=" +
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


  const result = [];
  const seen = {};


  providers.forEach(function(provider) {

    if (
      !provider ||
      !provider.provider_name
    ) {

      return;

    }


    const name =
      String(
        provider.provider_name
      ).trim();


    if (!name) {

      return;

    }


    const key =
      normalizeProviderKey(
        name
      );


    if (
      seen[key]
    ) {

      return;

    }


    seen[key] = true;


    result.push({

      provider_id:
        provider.provider_id || null,

      provider_name:
        name,

      logo_path:
        provider.logo_path || null,

      provider_url:
        provider.provider_url || null

    });

  });


  return result;

}


// =========================================================
// 無料視聴重複除去
// =========================================================

function uniqueProviders(
  providers
) {

  if (
    !Array.isArray(
      providers
    )
  ) {

    return [];

  }


  const result = [];
  const seen = {};


  providers.forEach(function(provider) {

    if (
      !provider ||
      !provider.provider_name
    ) {

      return;

    }


    const key =
      normalizeProviderKey(
        provider.provider_name
      );


    if (
      !key ||
      seen[key]
    ) {

      return;

    }


    seen[key] = true;


    result.push(
      provider
    );

  });


  return result;

}


// =========================================================
// サービス名正規化
// =========================================================

function normalizeProviderKey(
  name
) {

  const value =
    String(
      name || ""
    )
      .toLowerCase()
      .trim();


  if (
    value.includes("netflix")
  ) {

    return "netflix";

  }


  if (
    value.includes("amazon") ||
    value.includes("prime video")
  ) {

    return "amazon";

  }


  if (
    value.includes("u-next") ||
    value.includes("unext")
  ) {

    return "unext";

  }


  if (
    value.includes("hulu")
  ) {

    return "hulu";

  }


  if (
    value.includes("disney")
  ) {

    return "disney";

  }


  if (
    value.includes("apple")
  ) {

    return "apple";

  }


  if (
    value.includes("abema")
  ) {

    return "abema";

  }


  if (
    value.includes("youtube")
  ) {

    return "youtube";

  }


  return value;

}


// =========================================================
// 配信サービス検索
// =========================================================

function findProvider(
  streaming,
  rental,
  purchase,
  free,
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
      )
      .concat(
        free || []
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
```
