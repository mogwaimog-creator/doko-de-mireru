```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版
// 無料視聴 + ABEMA対応版
// =========================================================

module.exports = async function handler(req, res) {

  // -------------------------------------------------------
  // CORS
  // -------------------------------------------------------

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

    // -----------------------------------------------------
    // TMDB API KEY
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
      await fetchJson(searchUrl);

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
        normalizeTitle(a.title || "");

      const bTitle =
        normalizeTitle(b.title || "");

      const aExact =
        aTitle === normalizedQuery ? 0 : 1;

      const bExact =
        bTitle === normalizedQuery ? 0 : 1;

      if (aExact !== bExact) {
        return aExact - bExact;
      }

      return (
        Number(b.vote_average || 0) -
        Number(a.vote_average || 0)
      );

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
            Number(movie.vote_average || 0)

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

  // -------------------------------------------------------
  // 作品情報
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
  // 日本の配信情報
  // -------------------------------------------------------

  let providersJP = {};

  try {

    const providerUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "/watch/providers" +
      "?api_key=" +
      encodeURIComponent(apiKey);

    const providerData =
      await fetchJson(providerUrl);

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

  // -------------------------------------------------------
  // 配信サービス
  // -------------------------------------------------------

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

  // -------------------------------------------------------
  // 無料配信
  //
  // TMDBの
  // free
  // ads
  //
  // を両方取得
  // -------------------------------------------------------

  const freeProviders =
    []
      .concat(
        Array.isArray(providersJP.free)
          ? providersJP.free
          : []
      )
      .concat(
        Array.isArray(providersJP.ads)
          ? providersJP.ads
          : []
      );

  let free =
    normalizeProviders(
      freeProviders
    );

  // -------------------------------------------------------
  // ABEMA判定
  //
  // TMDB側でABEMAがfree / adsに入っている場合、
  // 無料配信として扱う。
  // -------------------------------------------------------

  const abemaProvider =
    findProviderByKeywords(
      free,
      [
        "abema",
        "abema tv",
        "abematv"
      ]
    );

  // -------------------------------------------------------
  // ABEMAが通常配信側にしかない場合
  //
  // TMDBのデータによってはABEMAが
  // flatrate等に入ることがあるため、
  // その場合もABEMAを検出する。
  // -------------------------------------------------------

  const abemaAny =
    findProviderByKeywords(
      []
        .concat(streaming)
        .concat(rental)
        .concat(purchase)
        .concat(free),
      [
        "abema",
        "abema tv",
        "abematv"
      ]
    );

  // -------------------------------------------------------
  // ABEMAが存在する場合
  //
  // 無料欄にも追加する。
  //
  // ただし、TMDB上で無料と判定されていない場合は
  // 「無料」と断定しない。
  // -------------------------------------------------------

  if (
    abemaProvider &&
    !containsProvider(
      free,
      abemaProvider.provider_name
    )
  ) {

    free.push(abemaProvider);

  }

  // -------------------------------------------------------
  // 無料配信重複除去
  // -------------------------------------------------------

  free =
    uniqueProviders(free);

  // -------------------------------------------------------
  // タイトル
  // -------------------------------------------------------

  const title =
    movie.title ||
    movie.original_title ||
    "";

  // -------------------------------------------------------
  // 各サービス
  // -------------------------------------------------------

  const netflixProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      free,
      [
        "netflix"
      ]
    );

  const amazonProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      free,
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
      free,
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
      free,
      [
        "hulu"
      ]
    );

  const disneyProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      free,
      [
        "disney"
      ]
    );

  const appleProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      free,
      [
        "apple"
      ]
    );

  // -------------------------------------------------------
  // Netflix
  // -------------------------------------------------------

  const netflixUrl =
    netflixProvider
      ? "https://www.netflix.com/jp/"
      : null;

  // -------------------------------------------------------
  // Amazon
  // -------------------------------------------------------

  const amazonUrl =
    amazonProvider
      ? createAmazonUrl(
          amazonProvider,
          title
        )
      : null;

  // -------------------------------------------------------
  // U-NEXT
  // -------------------------------------------------------

  const unextUrl =
    unextProvider
      ? createUnextUrl(title)
      : null;

  // -------------------------------------------------------
  // Hulu
  // -------------------------------------------------------

  const huluUrl =
    huluProvider
      ? createHuluUrl(title)
      : null;

  // -------------------------------------------------------
  // Disney+
  // -------------------------------------------------------

  const disneyUrl =
    disneyProvider
      ? createDisneyUrl(title)
      : null;

  // -------------------------------------------------------
  // Apple TV
  // -------------------------------------------------------

  const appleUrl =
    appleProvider
      ? createAppleUrl(title)
      : null;

  // -------------------------------------------------------
  // ABEMA
  // -------------------------------------------------------

  const abemaUrl =
    abemaAny
      ? createAbemaUrl(title)
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
  // TMDB配信ページ
  // -------------------------------------------------------

  const tmdbWatchLink =
    providersJP.link ||
    (
      "https://www.themoviedb.org/movie/" +
      movie.id +
      "/watch?locale=JP"
    );

  // -------------------------------------------------------
  // 完成データ
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
      Number(movie.vote_average || 0),

    original_language:
      movie.original_language || "",

    genres:
      Array.isArray(movie.genres)
        ? movie.genres
        : [],

    // -----------------------------------------------------
    // 監督
    // -----------------------------------------------------

    director:
      director,

    // -----------------------------------------------------
    // 出演者
    // -----------------------------------------------------

    cast:
      cast,

    // -----------------------------------------------------
    // 配信
    // -----------------------------------------------------

    streaming:
      streaming,

    rental:
      rental,

    purchase:
      purchase,

    // -----------------------------------------------------
    // 無料
    // -----------------------------------------------------

    free:
      free,

    // -----------------------------------------------------
    // ABEMA
    // -----------------------------------------------------

    abema:
      abemaAny
        ? {
            provider_name:
              abemaAny.provider_name,

            provider_id:
              abemaAny.provider_id || null,

            logo_path:
              abemaAny.logo_path || null,

            url:
              abemaUrl,

            free:
              !!abemaProvider
          }
        : null,

    abema_url:
      abemaUrl,

    abema_free:
      !!abemaProvider,

    // -----------------------------------------------------
    // Netflix
    // -----------------------------------------------------

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

    // -----------------------------------------------------
    // Amazon
    // -----------------------------------------------------

    amazon:
      amazonProvider
        ? {
            url:
              amazonUrl
          }
        : null,

    amazon_url:
      amazonUrl,

    // -----------------------------------------------------
    // U-NEXT
    // -----------------------------------------------------

    unext_url:
      unextUrl,

    // -----------------------------------------------------
    // Hulu
    // -----------------------------------------------------

    hulu_url:
      huluUrl,

    // -----------------------------------------------------
    // Disney+
    // -----------------------------------------------------

    disney_url:
      disneyUrl,

    // -----------------------------------------------------
    // Apple TV
    // -----------------------------------------------------

    apple_tv_url:
      appleUrl,

    // -----------------------------------------------------
    // シリーズ
    // -----------------------------------------------------

    series:
      series,

    // -----------------------------------------------------
    // TMDB
    // -----------------------------------------------------

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
    encodeURIComponent(title) +
    "&i=instant-video"
  );

}


// =========================================================
// U-NEXT
// =========================================================

function createUnextUrl(title) {

  return (
    "https://video.unext.jp/"
  );

}


// =========================================================
// Hulu
// =========================================================

function createHuluUrl(title) {

  return (
    "https://www.hulu.jp/search?q=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Disney+
// =========================================================

function createDisneyUrl(title) {

  return (
    "https://www.disneyplus.com/ja-jp/search/" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Apple TV
// =========================================================

function createAppleUrl(title) {

  return (
    "https://tv.apple.com/jp/search?term=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// ABEMA
// =========================================================

function createAbemaUrl(title) {

  return (
    "https://abema.tv/search?q=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// 配信サービス正規化
// =========================================================

function normalizeProviders(providers) {

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
// 無料配信重複除去
// =========================================================

function uniqueProviders(providers) {

  if (
    !Array.isArray(providers)
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
      String(
        provider.provider_name
      )
        .toLowerCase()
        .trim();

    if (
      !key ||
      seen[key]
    ) {

      return;

    }

    seen[key] = true;

    result.push(provider);

  });

  return result;

}


// =========================================================
// プロバイダー検索
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
      .concat(streaming || [])
      .concat(rental || [])
      .concat(purchase || [])
      .concat(free || []);

  return findProviderByKeywords(
    all,
    keywords
  );

}


// =========================================================
// キーワードによるサービス検索
// =========================================================

function findProviderByKeywords(
  providers,
  keywords
) {

  if (
    !Array.isArray(providers) ||
    !Array.isArray(keywords)
  ) {

    return null;

  }

  for (
    let i = 0;
    i < providers.length;
    i++
  ) {

    const provider =
      providers[i];

    if (
      !provider ||
      !provider.provider_name
    ) {

      continue;

    }

    const name =
      String(
        provider.provider_name
      ).toLowerCase();

    for (
      let j = 0;
      j < keywords.length;
      j++
    ) {

      if (
        name.includes(
          String(
            keywords[j]
          ).toLowerCase()
        )
      ) {

        return provider;

      }

    }

  }

  return null;

}


// =========================================================
// プロバイダー存在確認
// =========================================================

function containsProvider(
  providers,
  providerName
) {

  if (
    !Array.isArray(providers)
  ) {

    return false;

  }

  const target =
    String(
      providerName || ""
    )
      .toLowerCase()
      .trim();

  return providers.some(
    function(provider) {

      return (
        String(
          provider &&
          provider.provider_name || ""
        )
          .toLowerCase()
          .trim() === target
      );

    }
  );

}


// =========================================================
// 監督
// =========================================================

function getDirector(movie) {

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

function getCast(movie) {

  const cast =
    movie &&
    movie.credits &&
    Array.isArray(movie.credits.cast)
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
// JSON取得
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
// タイトル正規化
// =========================================================

function normalizeTitle(title) {

  return String(title || "")
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
