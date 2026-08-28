// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版
//
// ・映画検索
// ・作品詳細
// ・日本の配信情報
// ・見放題
// ・レンタル
// ・購入
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
// 【将来対応用の土台】
// ・映画
// ・ドラマ
// ・アニメ
// ・content_type
// ・media_type
//
// Netflix
// ・Netflix配信判定
// ・Netflixホームページへ移動
//
// ※ Netflix作品ID機能は使用しない
// =========================================================


// =========================================================
// メインAPI
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


  // =======================================================
  // OPTIONS
  // =======================================================

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  // =======================================================
  // GETのみ
  // =======================================================

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "GETメソッドのみ利用できます。"
    });
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
    // 将来対応用 type
    //
    // movie
    // tv
    //
    // 未指定の場合は movie
    //
    // ※ 現在のサイト動作を維持するため
    //    デフォルトは映画
    // =====================================================

    const requestedType =
      req.query &&
      typeof req.query.type === "string"
        ? req.query.type.trim().toLowerCase()
        : "movie";


    const contentType =
      requestedType === "tv"
        ? "tv"
        : "movie";


    // =====================================================
    // 作品詳細
    //
    // 現在は映画詳細をそのまま維持
    //
    // /api/search?id=519182
    //
    // 将来 type=tv に対応するときに
    // TV詳細APIへ拡張できる構造。
    // =====================================================

    if (id) {

      if (contentType === "tv") {

        const tv =
          await getTvDetail(
            id,
            apiKey
          );

        return res
          .status(200)
          .json(tv);

      }


      const movie =
        await getMovieDetail(
          id,
          apiKey
        );


      return res
        .status(200)
        .json(movie);
    }


    // =====================================================
    // 検索文字チェック
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error:
          "作品名を入力してください。"
      });
    }


    // =====================================================
    // 検索エンドポイント
    //
    // movie
    // → /search/movie
    //
    // tv
    // → /search/tv
    //
    // 現在は通常利用では movie。
    // =====================================================

    const searchEndpoint =
      contentType === "tv"
        ? "/search/tv"
        : "/search/movie";


    const searchUrl =
      "https://api.themoviedb.org/3" +
      searchEndpoint +
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


    // =====================================================
    // 検索結果
    // =====================================================

    let works =
      Array.isArray(data.results)
        ? data.results
        : [];


    // =====================================================
    // 不正データ除外
    // =====================================================

    works =
      works.filter(function(work) {

        return (
          work &&
          work.id &&
          (
            work.title ||
            work.name
          )
        );

      });


    // =====================================================
    // 完全一致を優先
    // =====================================================

    const normalizedQuery =
      normalizeTitle(query);


    works.sort(function(a, b) {

      const aTitle =
        normalizeTitle(
          a.title ||
          a.name ||
          ""
        );


      const bTitle =
        normalizeTitle(
          b.title ||
          b.name ||
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


      return (
        Number(b.vote_average || 0) -
        Number(a.vote_average || 0)
      );

    });


    // =====================================================
    // 最大10件
    // =====================================================

    works =
      works.slice(0, 10);


    // =====================================================
    // 結果整形
    //
    // 映画
    // content_type: movie
    //
    // ドラマ・アニメ
    // content_type: tv
    //
    // アニメについては将来、
    // genre_idsなどを利用して判定可能。
    // =====================================================

    const results =
      works.map(function(work) {

        return {

          id:
            work.id,


          title:
            work.title ||
            work.name ||
            "",


          original_title:
            work.original_title ||
            work.original_name ||
            "",


          release_date:
            work.release_date ||
            work.first_air_date ||
            "",


          poster_path:
            work.poster_path ||
            null,


          overview:
            work.overview ||
            "",


          vote_average:
            Number(
              work.vote_average || 0
            ),


          // =================================================
          // 将来対応用
          // =================================================

          content_type:
            contentType,


          media_type:
            contentType

        };

      });


    // =====================================================
    // JSON返却
    // =====================================================

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
// 映画作品詳細
// =========================================================

async function getMovieDetail(
  movieId,
  apiKey
) {

  // =======================================================
  // TMDB作品情報
  // =======================================================

  const movieUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&append_to_response=credits";


  const movie =
    await fetchJson(movieUrl);


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
  // Netflix
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


  // =======================================================
  // Amazon Prime Video
  // =======================================================

  const amazonProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "amazon",
        "prime video"
      ]
    );


  // =======================================================
  // U-NEXT
  // =======================================================

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


  // =======================================================
  // Hulu
  // =======================================================

  const huluProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "hulu"
      ]
    );


  // =======================================================
  // Disney+
  // =======================================================

  const disneyProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "disney"
      ]
    );


  // =======================================================
  // Apple TV
  // =======================================================

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
  // 作品IDは使用しない
  // =======================================================

  const netflixUrl =
    netflixProvider
      ? createNetflixUrl()
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
      ? createUnextUrl()
      : null;


  // =======================================================
  // Hulu URL
  // =======================================================

  const huluUrl =
    huluProvider
      ? createHuluUrl(title)
      : null;


  // =======================================================
  // Disney+ URL
  // =======================================================

  const disneyUrl =
    disneyProvider
      ? createDisneyUrl(title)
      : null;


  // =======================================================
  // Apple TV URL
  // =======================================================

  const appleUrl =
    appleProvider
      ? createAppleUrl(title)
      : null;


  // =======================================================
  // 監督
  // =======================================================

  const director =
    getDirector(movie);


  // =======================================================
  // 出演者
  // =======================================================

  const cast =
    getCast(movie);


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


    // ===================================================
    // 将来対応用
    // ===================================================

    content_type:
      "movie",


    media_type:
      "movie",


    // ===================================================
    // 監督
    // ===================================================

    director:
      director,


    // ===================================================
    // 出演者
    // ===================================================

    cast:
      cast,


    // ===================================================
    // 配信
    // ===================================================

    streaming:
      streaming,


    rental:
      rental,


    purchase:
      purchase,


    // ===================================================
    // Netflix
    // ===================================================

    netflix:
      netflixProvider
        ? {
            url:
              netflixUrl,

            direct:
              false
          }
        : null,


    netflix_url:
      netflixUrl,


    // ===================================================
    // Amazon
    // ===================================================

    amazon:
      amazonProvider
        ? {
            url:
              amazonUrl
          }
        : null,


    amazon_url:
      amazonUrl,


    // ===================================================
    // U-NEXT
    // ===================================================

    unext_url:
      unextUrl,


    // ===================================================
    // Hulu
    // ===================================================

    hulu_url:
      huluUrl,


    // ===================================================
    // Disney+
    // ===================================================

    disney_url:
      disneyUrl,


    // ===================================================
    // Apple TV
    // ===================================================

    apple_tv_url:
      appleUrl,


    // ===================================================
    // シリーズ
    // ===================================================

    series:
      series,


    // ===================================================
    // TMDB
    // ===================================================

    link:
      tmdbWatchLink

  };

}


// =========================================================
// TV作品詳細
//
// 【将来対応用の土台】
//
// 現在の detail.html は映画用なので、
// 実際にドラマ・アニメを表示する画面は
// 今後追加する。
//
// この関数を用意しておくことで、
// 将来 /api/search?id=xxx&type=tv
// に対応できる。
// =========================================================

async function getTvDetail(
  tvId,
  apiKey
) {

  const tvUrl =
    "https://api.themoviedb.org/3/tv/" +
    encodeURIComponent(tvId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&append_to_response=credits";


  const tv =
    await fetchJson(tvUrl);


  // =======================================================
  // 日本の配信情報
  // =======================================================

  let providersJP = {};


  try {

    const providerUrl =
      "https://api.themoviedb.org/3/tv/" +
      encodeURIComponent(tvId) +
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
      "TV WATCH PROVIDERS ERROR:",
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
    tv.name ||
    tv.original_name ||
    "";


  // =======================================================
  // 配信サービス
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
        "amazon",
        "prime video"
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
  // URL
  // =======================================================

  const netflixUrl =
    netflixProvider
      ? createNetflixUrl()
      : null;


  const amazonUrl =
    amazonProvider
      ? createAmazonUrl(
          amazonProvider,
          title
        )
      : null;


  const unextUrl =
    unextProvider
      ? createUnextUrl()
      : null;


  const huluUrl =
    huluProvider
      ? createHuluUrl(title)
      : null;


  const disneyUrl =
    disneyProvider
      ? createDisneyUrl(title)
      : null;


  const appleUrl =
    appleProvider
      ? createAppleUrl(title)
      : null;


  // =======================================================
  // 監督
  // =======================================================

  const director =
    getDirector(tv);


  // =======================================================
  // 出演者
  // =======================================================

  const cast =
    getCast(tv);


  // =======================================================
  // TMDB TV配信ページ
  // =======================================================

  const tmdbWatchLink =
    providersJP.link ||
    (
      "https://www.themoviedb.org/tv/" +
      tv.id +
      "/watch?locale=JP"
    );


  // =======================================================
  // アニメ判定の土台
  //
  // TMDBのAnimationジャンルIDは16
  //
  // 将来、アニメ表示を分ける際に利用する。
  // =======================================================

  const isAnime =
    Array.isArray(tv.genre_ids) &&
    tv.genre_ids.includes(16);


  // =======================================================
  // 完成データ
  // =======================================================

  return {

    id:
      tv.id,


    title:
      tv.name || "",


    original_title:
      tv.original_name || "",


    release_date:
      tv.first_air_date || "",


    poster_path:
      tv.poster_path || null,


    overview:
      tv.overview || "",


    vote_average:
      Number(
        tv.vote_average || 0
      ),


    original_language:
      tv.original_language || "",


    genres:
      Array.isArray(tv.genres)
        ? tv.genres
        : [],


    // ===================================================
    // 将来対応用
    // ===================================================

    content_type:
      "tv",


    media_type:
      "tv",


    // ===================================================
    // アニメ判定
    // ===================================================

    is_anime:
      isAnime,


    // ===================================================
    // シーズン情報
    //
    // 将来のドラマ・アニメ詳細画面で使用。
    // ===================================================

    number_of_seasons:
      Number(
        tv.number_of_seasons || 0
      ),


    number_of_episodes:
      Number(
        tv.number_of_episodes || 0
      ),


    seasons:
      Array.isArray(tv.seasons)
        ? tv.seasons.map(function(season) {

            return {

              id:
                season.id ||
                null,

              season_number:
                Number(
                  season.season_number || 0
                ),

              name:
                season.name ||
                "",

              episode_count:
                Number(
                  season.episode_count || 0
                ),

              air_date:
                season.air_date ||
                "",

              poster_path:
                season.poster_path ||
                null

            };

          })
        : [],


    // ===================================================
    // 監督
    // ===================================================

    director:
      director,


    // ===================================================
    // 出演者
    // ===================================================

    cast:
      cast,


    // ===================================================
    // 配信
    // ===================================================

    streaming:
      streaming,


    rental:
      rental,


    purchase:
      purchase,


    // ===================================================
    // Netflix
    // ===================================================

    netflix:
      netflixProvider
        ? {
            url:
              netflixUrl,

            direct:
              false
          }
        : null,


    netflix_url:
      netflixUrl,


    // ===================================================
    // Amazon
    // ===================================================

    amazon:
      amazonProvider
        ? {
            url:
              amazonUrl
          }
        : null,


    amazon_url:
      amazonUrl,


    // ===================================================
    // U-NEXT
    // ===================================================

    unext_url:
      unextUrl,


    // ===================================================
    // Hulu
    // ===================================================

    hulu_url:
      huluUrl,


    // ===================================================
    // Disney+
    // ===================================================

    disney_url:
      disneyUrl,


    // ===================================================
    // Apple TV
    // ===================================================

    apple_tv_url:
      appleUrl,


    // ===================================================
    // TMDB
    // ===================================================

    link:
      tmdbWatchLink

  };

}


// =========================================================
// Netflix URL
//
// 作品IDは使わない
// =========================================================

function createNetflixUrl() {

  return "https://www.netflix.com/jp/search";

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

function createUnextUrl() {

  return "https://video.unext.jp/";

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
          provider.provider_id ||
          null,

        provider_name:
          provider.provider_name ||
          "",

        logo_path:
          provider.logo_path ||
          null,

        provider_url:
          provider.provider_url ||
          null

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
// 監督
// =========================================================

function getDirector(movie) {

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
          crew[i].id ||
          null,

        name:
          crew[i].name ||
          ""

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
          person.id ||
          null,

        name:
          person.name ||
          ""

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
        data.name ||
        "",


      movies:
        movies.map(function(movie) {

          return {

            id:
              movie.id,

            title:
              movie.title ||
              "",

            release_date:
              movie.release_date ||
              "",

            poster_path:
              movie.poster_path ||
              null,

            content_type:
              "movie",

            media_type:
              "movie"

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


  console.log(
    "TMDB STATUS:",
    response.status
  );


  let data;


  try {

    data =
      JSON.parse(text);

  } catch (error) {

    console.error(
      "TMDB RESPONSE:",
      text.substring(0, 1000)
    );


    throw new Error(
      "TMDBの応答をJSONとして解析できませんでした。HTTP STATUS: " +
      response.status
    );

  }


  if (!response.ok) {

    console.error(
      "TMDB API ERROR:",
      data
    );


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
