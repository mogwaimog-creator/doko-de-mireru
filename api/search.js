// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版 + おすすめ作品
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
// ・FOD
// ・Google Play
// ・監督
// ・出演者
// ・シリーズ
// ・おすすめ作品
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


const popular =
  req.query &&
  typeof req.query.popular === "string"
    ? req.query.popular.trim()
    : "";

    // =====================================================
// ページ番号
// =====================================================

const page =
  req.query &&
  typeof req.query.page === "string"
    ? Math.max(
        1,
        parseInt(req.query.page, 10) || 1
      )
    : 1;


// =====================================================
// 作品タイプ
//
// movie = 映画
// tv    = ドラマ・アニメ
//
// 指定がない場合は映画
// =====================================================

const type =
  req.query &&
  typeof req.query.type === "string"
    ? req.query.type.trim().toLowerCase()
    : "movie";
    
    // =====================================================
    // 作品詳細
    // =====================================================

    if (id) {

  // TV作品の場合
  if (type === "tv") {

    const result =
      await getTvDetail(
        id,
        apiKey
      );

    return res.status(200).json(result);
  }

  // 映画の場合
  const result =
    await getMovieDetail(
      id,
      apiKey
    );

  return res.status(200).json(result);
}

// =====================================================
// 人気作品
// =====================================================

if (popular === "1") {

  const popularMovies =
    await getPopularMovies(
      apiKey
    );

  return res
    .status(200)
    .json({
      results: popularMovies
    });

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
// ドラマ・アニメ検索
//
// TMDBではドラマ・アニメのTV作品を
// /search/tv で検索する
//
// type=tv の場合はこちらを使用
// =====================================================

if (type === "tv") {

  const tvResults =
    await searchTvShows(
      query,
      apiKey,
      page
    );

  return res.status(200).json({
    results: tvResults.results,
    page: tvResults.page,
    hasMore: tvResults.hasMore
  });

}


    
// =====================================================
// TMDB映画検索
//
// 通常検索 + 表記ゆれ検索 + 日本語タイトル補正
//
// 例:
//
// ロード・オブ・ザ・リング
// ロードオブザリング
// ロード オブ ザ リング
//
// どの表記でもできるだけ検索できるようにする
// =====================================================

const searchQueries = [];


// =====================================================
// 元の検索語
// =====================================================

searchQueries.push(query);


// =====================================================
// 記号・空白を除去した検索語
// =====================================================

const compactQuery =
  normalizeSearchQuery(query);


if (
  compactQuery &&
  !searchQueries.includes(compactQuery)
) {

  searchQueries.push(
    compactQuery
  );

}


// =====================================================
// 日本語タイトルの表記ゆれ候補
//
// 「オブ」「ザ」などを分離して検索
//
// 例:
// ロードオブザリング
//
// ↓
//
// ロード オブ ザ リング
//
// TMDBではこちらの方が検索にヒットしやすい
// =====================================================

const spacedQuery =
  createSpacedSearchQuery(
    compactQuery
  );


if (
  spacedQuery &&
  !searchQueries.includes(spacedQuery)
) {

  searchQueries.push(
    spacedQuery
  );

}


// =====================================================
// 中黒を使った検索候補
//
// 例:
// ロード・オブ・ザ・リング
// =====================================================

const middleDotQuery =
  createMiddleDotSearchQuery(
    compactQuery
  );


if (
  middleDotQuery &&
  !searchQueries.includes(
    middleDotQuery
  )
) {

  searchQueries.push(
    middleDotQuery
  );

}


// =====================================================
// TMDB検索結果をまとめる
// =====================================================

let allMovies = [];
let hasMore = false;

// =====================================================
// 複数の検索語でTMDBを検索
// =====================================================

for (
  let i = 0;
  i < searchQueries.length;
  i++
) {

  const searchQuery =
    searchQueries[i];


  const searchUrl =
    "https://api.themoviedb.org/3/search/movie" +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&region=JP" +
    "&include_adult=false" +
    "&page=" +
　　　page +
    "&query=" +
    encodeURIComponent(searchQuery);


  try {

    const data =
  await fetchJson(
    searchUrl
  );


if (
  data &&
  Array.isArray(data.results)
) {

  // =================================================
  // コレクションを除外
  //
  // TMDB検索結果に
  // 「○○ シリーズ」などのコレクションが
  // 混ざる場合があるため除外する
  // =================================================

  const movieResults =
  data.results.filter(
    function(movie) {

      if (!movie) {
        return false;
      }

      // TMDBのコレクションを除外
      if (
        movie.media_type === "collection"
      ) {
        return false;
      }

      // 映画として必要な情報がないものを除外
      if (!movie.id) {
        return false;
      }

      if (!movie.title) {
        return false;
      }

      return true;
    }
  );


  allMovies =
    allMovies.concat(
      movieResults
    );


  // ===================================================
  // 次のページが存在するか確認
  // ===================================================

  if (
    Number(data.page || page) <
    Number(data.total_pages || page)
  ) {

    hasMore = true;

  }

}
  
  } catch (error) {

    console.error(
      "TMDB SEARCH ERROR:",
      error
    );

  }

}


// =====================================================
// 重複作品を削除
// =====================================================

const movieMap =
  new Map();


allMovies.forEach(function(movie) {

  if (
    movie &&
    movie.id &&
    movie.title
  ) {

    movieMap.set(
      String(movie.id),
      movie
    );

  }

});


let movies =
  Array.from(
    movieMap.values()
  );


// =====================================================
// 不正データ除外
// =====================================================

movies =
  movies.filter(function(movie) {

    if (!movie) {
      return false;
    }

    if (
      movie.media_type === "collection"
    ) {
      return false;
    }

    if (!movie.id) {
      return false;
    }

    if (!movie.title) {
      return false;
    }

    return true;
  });

// =====================================================
// 完全一致を優先
//
// 表記ゆれも同じタイトルとして扱う
// =====================================================

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


  if (
    aExact !== bExact
  ) {

    return (
      aExact - bExact
    );

  }


  return (
    Number(b.vote_average || 0) -
    Number(a.vote_average || 0)
  );

});


// =====================================================
// 最大20件
// =====================================================

movies =
  movies.slice(0, 20);


// =====================================================
// 結果整形
// =====================================================
//
// TMDB映画検索APIでは上映時間が取得できないため
// 各作品の詳細APIからruntimeと配信情報を取得する
//
// ここでは、詳細APIで「映画」として正常に取得できた
// 作品だけを最終結果に残す
// =====================================================

const results =
  await Promise.all(

    movies.map(
      async function(movie) {

        // =================================================
        // 初期値
        // =================================================

        let runtime = 0;

        let streaming = [];

        let rental = [];

        let purchase = [];

        let detailData = null;


        // =================================================
        // 映画詳細・配信情報取得
        // =================================================

        try {

          const detailUrl =
            "https://api.themoviedb.org/3/movie/" +
            encodeURIComponent(movie.id) +
            "?api_key=" +
            encodeURIComponent(apiKey) +
            "&language=ja-JP" +
            "&append_to_response=watch/providers";


          detailData =
            await fetchJson(
              detailUrl
            );


          // =================================================
          // 詳細APIで正常な映画データが取得できない場合
          // =================================================

          if (
            !detailData ||
            !detailData.id ||
            detailData.id !== movie.id
          ) {

            return null;

          }


          // =================================================
          // タイトルが存在しない場合も除外
          // =================================================

          if (
            !detailData.title
          ) {

            return null;

          }


          // =================================================
          // 上映時間
          // =================================================

          runtime =
            Number(
              detailData.runtime || 0
            );


          // =================================================
          // 日本の配信情報
          // =================================================

          let providersJP = {};


          if (
            detailData &&
            detailData["watch/providers"] &&
            detailData["watch/providers"].results &&
            detailData["watch/providers"].results.JP
          ) {

            providersJP =
              detailData["watch/providers"].results.JP;

          }


          // =================================================
          // 見放題
          // =================================================

          streaming =
            normalizeProviders(
              providersJP.flatrate
            );


          // =================================================
          // レンタル
          // =================================================

          rental =
            normalizeProviders(
              providersJP.rent
            );


          // =================================================
          // 購入
          // =================================================

          purchase =
            normalizeProviders(
              providersJP.buy
            );


        } catch (error) {

          console.error(
            "MOVIE DETAIL ERROR:",
            movie.id,
            movie.title,
            error
          );


          // =================================================
          // 詳細APIで映画として取得できない作品は
          // 検索結果から除外
          // =================================================

          return null;

        }


        // =================================================
        // 最終的な映画データ
        // =================================================

        return {

          id:
            movie.id,


          // =================================================
          // タイトル
          // =================================================

          title:
            detailData.title ||
            movie.title ||
            "",


          // =================================================
          // 作品タイプ
          // =================================================

          media_type:
            "劇場版",


          // =================================================
          // 上映時間
          // =================================================

          runtime:
            runtime,


          // =================================================
          // 配信情報
          // =================================================

          streaming:
            streaming,


          rental:
            rental,


          purchase:
            purchase,


          // =================================================
          // その他
          // =================================================

          original_title:
            detailData.original_title ||
            movie.original_title ||
            "",


          release_date:
            detailData.release_date ||
            movie.release_date ||
            "",


          poster_path:
            detailData.poster_path ||
            movie.poster_path ||
            null,


          overview:
            detailData.overview ||
            movie.overview ||
            "",


          vote_average:
            Number(
              detailData.vote_average ??
              movie.vote_average ??
              0
            )

        };

      }
    )

  );


// =====================================================
// null を除外
//
// 詳細APIで映画として確認できなかった作品を除外
// =====================================================

const validResults =
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
// JSON返却
// =====================================================

return res.status(200).json({

  results:
    validResults,

  page:
    page,

  hasMore:
    hasMore

});



  } catch (error) {

    console.error(
      "SEARCH API ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "サーバー内部でエラーが発生しました。"
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
// 作品タイプ
//
// 現在は映画検索を使用
// 将来ドラマ・アニメ検索を追加できるように
// 作品タイプを独立して管理
// =======================================================

let mediaType = "劇場版";


// =======================================================
// テレビ映画判定
//
// TMDBの movie 情報だけでは完全判定できないため
// 現在はタイトル・概要などから明確なテレビ作品を
// 判定できる場合のみ使用
// =======================================================

const movieTitle =
  String(
    movie.title ||
    movie.original_title ||
    ""
  );

const movieOverview =
  String(
    movie.overview ||
    ""
  );


// =======================================================
// テレビ映画らしい作品
// =======================================================

if (
  /テレビ映画|TV映画|TV Movie|Television Movie/i.test(
    movieTitle + " " + movieOverview
  )
) {

  mediaType = "テレビ映画";

}


// =======================================================
// 上映時間
// =======================================================

const runtime =
  Number(
    movie.runtime || 0
  );

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
  // FOD
  // =======================================================

  const fodProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "fod"
      ]
    );


  // =======================================================
  // Google Play
  // =======================================================

  const googlePlayProvider =
    findProvider(
      streaming,
      rental,
      purchase,
      [
        "google play",
        "google play movies",
        "google"
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
  // FOD URL
  // =======================================================

  const fodUrl =
    fodProvider
      ? createFodUrl(
          fodProvider,
          title
        )
      : null;


  // =======================================================
  // Google Play URL
  // =======================================================

  const googlePlayUrl =
    googlePlayProvider
      ? createGooglePlayUrl(
          googlePlayProvider,
          title
        )
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
// おすすめ作品
//
// 改良版
//
// ・TMDB recommendations を優先
// ・同じシリーズ作品を最優先
// ・ジャンルの近さを考慮
// ・明らかに関連性の低い作品を除外
// ・元作品自身を除外
// ・最大10作品
// =======================================================

let recommendations = [];


try {

  recommendations =
    await getRecommendations(
      movie,
      apiKey
    );

} catch (error) {

  console.error(
    "RECOMMENDATIONS ERROR:",
    error
  );

  recommendations = [];

}

  // =======================================================
  // シリーズ
  //
  // TMDBのコレクション情報
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


  // ===================================================
  // 作品タイプ
  // ===================================================

  media_type:
    mediaType,


  // ===================================================
  // 上映時間
  // ===================================================

  runtime:
    runtime,


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
    // FOD
    // ===================================================

    fod:
      fodProvider
        ? {
            url:
              fodUrl
          }
        : null,


    fod_url:
      fodUrl,


    // ===================================================
    // Google Play
    // ===================================================

    google_play:
      googlePlayProvider
        ? {
            url:
              googlePlayUrl
          }
        : null,


    google_play_url:
      googlePlayUrl,


    // ===================================================
    // おすすめ作品
    // ===================================================

    recommendations:
      recommendations,


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
// Netflix URL
//
// 作品IDは使わない
// =========================================================

function createNetflixUrl() {

  return (
    "https://www.netflix.com/jp/search"
  );

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
// FOD
//
// TMDBから作品URLが取れた場合
// → そのURL
//
// 取れない場合
// → FODホーム
// =========================================================

function createFodUrl(
  provider,
  title
) {

  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    ) &&
    /fod\./i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }


  if (
    provider &&
    typeof provider.url === "string" &&
    /^https?:\/\//i.test(
      provider.url
    ) &&
    /fod\./i.test(
      provider.url
    )
  ) {

    return provider.url;

  }


  if (
    provider &&
    typeof provider.link === "string" &&
    /^https?:\/\//i.test(
      provider.link
    ) &&
    /fod\./i.test(
      provider.link
    )
  ) {

    return provider.link;

  }


  return (
    "https://fod.fujitv.co.jp/"
  );

}


// =========================================================
// Google Play
// =========================================================

function createGooglePlayUrl(
  provider,
  title
) {

  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    ) &&
    /google\./i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }


  if (
    provider &&
    typeof provider.url === "string" &&
    /^https?:\/\//i.test(
      provider.url
    ) &&
    /google\./i.test(
      provider.url
    )
  ) {

    return provider.url;

  }


  if (
    provider &&
    typeof provider.link === "string" &&
    /^https?:\/\//i.test(
      provider.link
    ) &&
    /google\./i.test(
      provider.link
    )
  ) {

    return provider.link;

  }


  return (
    "https://play.google.com/store/search?q=" +
    encodeURIComponent(title) +
    "&c=movies"
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
// おすすめ作品取得
//
// 優先順位
//
// 1. 同じシリーズ
// 2. TMDB recommendations
// 3. ジャンル一致
// 4. 評価・人気度
//
// =========================================================

async function getRecommendations(
  movie,
  apiKey
) {

  const movieId =
    movie &&
    movie.id
      ? movie.id
      : null;


  if (!movieId) {

    return [];

  }


  // =======================================================
  // 元作品のジャンル
  // =======================================================

  const originalGenres =
    Array.isArray(movie.genres)
      ? movie.genres.map(function(genre) {

          return Number(
            genre.id
          );

        })
      : [];


  // =======================================================
  // 元作品のシリーズID
  // =======================================================

  const collectionId =
    movie.belongs_to_collection &&
    movie.belongs_to_collection.id
      ? String(
          movie.belongs_to_collection.id
        )
      : null;


  // =======================================================
  // TMDB recommendations
  // =======================================================

  const recommendationUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "/recommendations" +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&page=1";


  let recommendationMovies = [];


  try {

    const recommendationData =
      await fetchJson(
        recommendationUrl
      );


    if (
      recommendationData &&
      Array.isArray(
        recommendationData.results
      )
    ) {

      recommendationMovies =
        recommendationData.results;

    }

  } catch (error) {

    console.error(
      "TMDB RECOMMENDATIONS ERROR:",
      error
    );

  }


  // =======================================================
  // 同じシリーズ作品
  // =======================================================

  let collectionMovies = [];


  if (collectionId) {

    try {

      const collection =
        await getCollection(
          collectionId,
          apiKey
        );


      if (
        collection &&
        Array.isArray(
          collection.movies
        )
      ) {

        collectionMovies =
          collection.movies
            .filter(function(item) {

              return (
                item &&
                item.id &&
                String(item.id) !==
                  String(movie.id)
              );

            });

      }

    } catch (error) {

      console.error(
        "COLLECTION RECOMMENDATIONS ERROR:",
        error
      );

    }

  }


  // =======================================================
  // 同じシリーズを最優先
  // =======================================================

  const collectionMap =
    new Map();


  collectionMovies.forEach(
    function(item) {

      collectionMap.set(
        String(item.id),
        item
      );

    }
  );


  // =======================================================
  // recommendationsを整理
  // =======================================================

  const candidateMap =
    new Map();


  recommendationMovies.forEach(
    function(item) {

      if (
        !item ||
        !item.id ||
        !item.title
      ) {

        return;

      }


      if (
        String(item.id) ===
        String(movie.id)
      ) {

        return;

      }


      candidateMap.set(
        String(item.id),
        item
      );

    }
  );


  // =======================================================
  // recommendations候補に
  // シリーズ作品を追加
  // =======================================================

  collectionMovies.forEach(
    function(item) {

      if (
        !item ||
        !item.id ||
        !item.title
      ) {

        return;

      }


      if (
        String(item.id) ===
        String(movie.id)
      ) {

        return;

      }


      if (
        !candidateMap.has(
          String(item.id)
        )
      ) {

        candidateMap.set(
          String(item.id),
          item
        );

      }

    }
  );


  // =======================================================
  // スコアリング
  // =======================================================

  const candidates =
    Array.from(
      candidateMap.values()
    );


  const scored =
    candidates.map(
      function(item) {

        let score = 0;


        // =================================================
        // 同じシリーズ
        // =================================================

        if (
          collectionMap.has(
            String(item.id)
          )
        ) {

          score += 1000;

        }


        // =================================================
        // ジャンル一致
        // =================================================

        const itemGenres =
          Array.isArray(
            item.genre_ids
          )
            ? item.genre_ids.map(
                function(id) {
                  return Number(id);
                }
              )
            : [];


        let genreMatches = 0;


        itemGenres.forEach(
          function(genreId) {

            if (
              originalGenres.includes(
                genreId
              )
            ) {

              genreMatches++;

            }

          }
        );


        score +=
          genreMatches * 100;


        // =================================================
        // 人気度
        // =================================================

        score +=
          Math.min(
            Number(
              item.popularity || 0
            ),
            100
          );


        // =================================================
        // 評価
        // =================================================

        score +=
          Number(
            item.vote_average || 0
          ) * 5;


        return {

          item:
            item,

          score:
            score

        };

      }
    );


  // =======================================================
  // スコア順
  // =======================================================

  scored.sort(
    function(a, b) {

      return (
        b.score -
        a.score
      );

    }
  );


  // =======================================================
  // 最大10作品
  // =======================================================

  return scored
    .slice(0, 10)
    .map(
      function(result) {

        const item =
          result.item;


        return {

          id:
            item.id,


          title:
            item.title || "",


          release_date:
            item.release_date || "",


          poster_path:
            item.poster_path || null

        };

      }
    );

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

// =========================================================
// 検索用タイトル正規化
//
// 検索入力の表記ゆれ対策
//
// 例:
// ロード・オブ・ザ・リング
// ↓
// ロードオブザリング
//
// ロード オブ ザ リング
// ↓
// ロードオブザリング
// =========================================================

function normalizeSearchQuery(query) {

  return String(
    query || ""
  )
    .replace(
      /[\s　]/g,
      ""
    )
    .replace(
      /[「」『』【】（）()・:：!?！？,.，。]/g,
      ""
    )
    .trim();

}


// =========================================================
// 検索用スペース補正
//
// 例:
// ロードオブザリング
// ↓
// ロード オブ ザ リング
// =========================================================

function createSpacedSearchQuery(query) {

  let value =
    String(
      query || ""
    );


  if (!value) {
    return "";
  }


  value =
    value.replace(
      /オブ/g,
      " オブ "
    );


  value =
    value.replace(
      /ザ/g,
      " ザ "
    );


  value =
    value
      .replace(
        /\s+/g,
        " "
      )
      .trim();


  return value;

}


// =========================================================
// 中黒補正
//
// 例:
// ロードオブザリング
// ↓
// ロード・オブ・ザ・リング
// =========================================================

function createMiddleDotSearchQuery(query) {

  let value =
    String(
      query || ""
    );


  if (!value) {
    return "";
  }


  value =
    value.replace(
      /オブ/g,
      "・オブ・"
    );


  value =
    value.replace(
      /ザ/g,
      "・ザ・"
    );


  value =
    value.replace(
      /・+/g,
      "・"
    );


  return value;

}

// =========================================================
// 人気作品取得
//
// TMDBの
// ・現在上映中
// ・公開予定
//
// を取得して人気順にまとめる
//
// ※ 片方のAPIが失敗しても
//    もう片方を使用する
// =========================================================

async function getPopularMovies(apiKey) {

  // =======================================================
  // 現在上映中
  // =======================================================

  const nowPlayingUrl =
    "https://api.themoviedb.org/3/movie/now_playing" +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&region=JP" +
    "&page=1";


  // =======================================================
  // 公開予定
  // =======================================================

  const upcomingUrl =
    "https://api.themoviedb.org/3/movie/upcoming" +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&region=JP" +
    "&page=1";


  let nowPlayingMovies = [];
  let upcomingMovies = [];


  // =======================================================
  // 現在上映中を取得
  // =======================================================

  try {

    const nowPlayingData =
      await fetchJson(
        nowPlayingUrl
      );


    if (
      nowPlayingData &&
      Array.isArray(
        nowPlayingData.results
      )
    ) {

      nowPlayingMovies =
        nowPlayingData.results;

    }

  } catch (error) {

    console.error(
      "NOW PLAYING ERROR:",
      error
    );

  }


  // =======================================================
  // 公開予定を取得
  // =======================================================

  try {

    const upcomingData =
      await fetchJson(
        upcomingUrl
      );


    if (
      upcomingData &&
      Array.isArray(
        upcomingData.results
      )
    ) {

      upcomingMovies =
        upcomingData.results;

    }

  } catch (error) {

    console.error(
      "UPCOMING ERROR:",
      error
    );

  }


  // =======================================================
  // データ結合
  // =======================================================

  let allMovies =
    []
      .concat(
        nowPlayingMovies
      )
      .concat(
        upcomingMovies
      );


  // =======================================================
  // 両方とも取得できなかった場合
  //
  // TMDB人気映画を取得
  // =======================================================

  if (!allMovies.length) {

    try {

      const popularUrl =
        "https://api.themoviedb.org/3/movie/popular" +
        "?api_key=" +
        encodeURIComponent(apiKey) +
        "&language=ja-JP" +
        "&region=JP" +
        "&page=1";


      const popularData =
        await fetchJson(
          popularUrl
        );


      if (
        popularData &&
        Array.isArray(
          popularData.results
        )
      ) {

        allMovies =
          popularData.results;

      }

    } catch (error) {

      console.error(
        "POPULAR FALLBACK ERROR:",
        error
      );

    }

  }


  // =======================================================
  // まだ作品がない場合
  // =======================================================

  if (!allMovies.length) {

    return [];

  }


  // =======================================================
  // 重複削除
  // =======================================================

  const movieMap =
    new Map();


  allMovies.forEach(function(movie) {

    if (
      movie &&
      movie.id
    ) {

      movieMap.set(
        String(movie.id),
        movie
      );

    }

  });


  let movies =
    Array.from(
      movieMap.values()
    );


  // =======================================================
  // 人気順
  // =======================================================

  movies.sort(function(a, b) {

    return (
      Number(
        b.popularity || 0
      ) -
      Number(
        a.popularity || 0
      )
    );

  });


  // =======================================================
  // 今日の日付
  // =======================================================

  const today =
    new Date();


  today.setHours(
    0,
    0,
    0,
    0
  );


  // =======================================================
// 最大5作品
// =======================================================

movies =
  movies.slice(
    0,
    5
  );

  // =======================================================
  // 結果整形
  // =======================================================

  return movies.map(function(movie) {

    const releaseDate =
      movie.release_date || "";


    let status =
      "公開済み";


    let statusType =
      "planned";


    // =====================================================
    // 公開日がある場合
    // =====================================================

    if (releaseDate) {

      const release =
        new Date(
          releaseDate +
          "T00:00:00"
        );


      if (
        release > today
      ) {

        // -----------------------------------------------
        // 公開予定
        // -----------------------------------------------

        status =
          formatJapaneseReleaseDate(
            releaseDate
          ) +
          " 公開予定";


        statusType =
          "coming";

      } else {

        // -----------------------------------------------
        // 公開済み
        // -----------------------------------------------

        status =
          "上映中";


        statusType =
          "now";

      }

    }


    return {

      id:
        movie.id,


      title:
        movie.title ||
        movie.original_title ||
        "",


      original_title:
        movie.original_title ||
        "",


      release_date:
        releaseDate,


      poster_path:
        movie.poster_path ||
        null,


      popularity:
        Number(
          movie.popularity || 0
        ),


      status:
        status,


      status_type:
        statusType

    };

  });

}
// =========================================================
// 公開日表示
//
// 例:
// 2026-09-11
//
// ↓
//
// 2026年9月11日
// =========================================================

function formatJapaneseReleaseDate(
date
) {

if (!date) {
return "";
}

const parts =
String(date).split("-");

if (
parts.length !== 3
) {


return date;


}

const year =
Number(parts[0]);

const month =
Number(parts[1]);

const day =
Number(parts[2]);

if (
!year ||
!month ||
!day
) {


return date;


}

return (
year +
"年" +
month +
"月" +
day +
"日"
);

}

// =========================================================
// ドラマ・アニメ検索
//
// TMDB /search/tv を使用
//
// ・ドラマ
// ・アニメ
// ・その他TV作品
//
// を検索する
// =========================================================

async function searchTvShows(
  query,
  apiKey,
  page
) {

  // =======================================================
  // 検索候補
  // =======================================================

  const searchQueries = [];


  // =======================================================
  // 元の検索語
  // =======================================================

  searchQueries.push(
    query
  );


  // =======================================================
  // 空白・記号を除去
  // =======================================================

  const compactQuery =
    normalizeSearchQuery(
      query
    );


  if (
    compactQuery &&
    !searchQueries.includes(
      compactQuery
    )
  ) {

    searchQueries.push(
      compactQuery
    );

  }


  // =======================================================
  // スペース補正
  // =======================================================

  const spacedQuery =
    createSpacedSearchQuery(
      compactQuery
    );


  if (
    spacedQuery &&
    !searchQueries.includes(
      spacedQuery
    )
  ) {

    searchQueries.push(
      spacedQuery
    );

  }


  // =======================================================
  // 中黒補正
  // =======================================================

  const middleDotQuery =
    createMiddleDotSearchQuery(
      compactQuery
    );


  if (
    middleDotQuery &&
    !searchQueries.includes(
      middleDotQuery
    )
  ) {

    searchQueries.push(
      middleDotQuery
    );

  }


  // =======================================================
  // 検索結果
  // =======================================================

  let allShows = [];

  let hasMore = false;


  // =======================================================
  // 複数候補で検索
  // =======================================================

  for (
    let i = 0;
    i < searchQueries.length;
    i++
  ) {

    const searchQuery =
      searchQueries[i];


    const searchUrl =
      "https://api.themoviedb.org/3/search/tv" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&include_adult=false" +
      "&page=" +
      page +
      "&query=" +
      encodeURIComponent(
        searchQuery
      );


    try {

      const data =
        await fetchJson(
          searchUrl
        );


      if (
        data &&
        Array.isArray(
          data.results
        )
      ) {

        allShows =
          allShows.concat(
            data.results
          );


        if (
          Number(
            data.page || page
          ) <
          Number(
            data.total_pages || page
          )
        ) {

          hasMore = true;

        }

      }

    } catch (error) {

      console.error(
        "TMDB TV SEARCH ERROR:",
        error
      );

    }

  }


  // =======================================================
  // 重複削除
  // =======================================================

  const showMap =
    new Map();


  allShows.forEach(
    function(show) {

      if (
        show &&
        show.id &&
        (
          show.name ||
          show.original_name
        )
      ) {

        showMap.set(
          String(show.id),
          show
        );

      }

    }
  );


  let shows =
    Array.from(
      showMap.values()
    );


  // =======================================================
  // 完全一致を優先
  // =======================================================

  const normalizedQuery =
    normalizeTitle(
      query
    );


  shows.sort(
    function(a, b) {

      const aTitle =
        normalizeTitle(
          a.name ||
          a.original_name ||
          ""
        );


      const bTitle =
        normalizeTitle(
          b.name ||
          b.original_name ||
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

    }
  );


  // =======================================================
  // 最大20件
  // =======================================================

  shows =
    shows.slice(
      0,
      20
    );


  // =======================================================
  // 詳細情報・配信情報取得
  // =======================================================

  const results =
    await Promise.all(

      shows.map(
        async function(show) {

          let episodeRuntime = 0;

          let streaming = [];

          let rental = [];

          let purchase = [];


          try {

            const detailUrl =
              "https://api.themoviedb.org/3/tv/" +
              encodeURIComponent(
                show.id
              ) +
              "?api_key=" +
              encodeURIComponent(
                apiKey
              ) +
              "&language=ja-JP" +
              "&append_to_response=watch/providers";


            const detailData =
              await fetchJson(
                detailUrl
              );


            // =================================================
            // 1話あたりの時間
            // =================================================

            if (
              Array.isArray(
                detailData.episode_run_time
              ) &&
              detailData.episode_run_time.length
            ) {

              episodeRuntime =
                Number(
                  detailData
                    .episode_run_time[0] ||
                  0
                );

            }


            // =================================================
            // 日本の配信情報
            // =================================================

            let providersJP = {};


            if (
              detailData &&
              detailData["watch/providers"] &&
              detailData["watch/providers"].results &&
              detailData["watch/providers"].results.JP
            ) {

              providersJP =
                detailData[
                  "watch/providers"
                ].results.JP;

            }


            // =================================================
            // 見放題
            // =================================================

            streaming =
              normalizeProviders(
                providersJP.flatrate
              );


            // =================================================
            // レンタル
            // =================================================

            rental =
              normalizeProviders(
                providersJP.rent
              );


            // =================================================
            // 購入
            // =================================================

            purchase =
              normalizeProviders(
                providersJP.buy
              );

          } catch (error) {

            console.error(
              "TV DETAIL / PROVIDER ERROR:",
              error
            );

          }


          // =================================================
          // TV作品として返却
          // =================================================

          return {

            id:
              show.id,


            title:
              show.name ||
              show.original_name ||
              "",


            original_title:
              show.original_name ||
              "",


            media_type:
              "TV",


            runtime:
              episodeRuntime,


            release_date:
              show.first_air_date ||
              "",


            poster_path:
              show.poster_path ||
              null,


            overview:
              show.overview ||
              "",


            vote_average:
              Number(
                show.vote_average ||
                0
              ),


            original_language:
              show.original_language ||
              "",


            streaming:
              streaming,


            rental:
              rental,


            purchase:
              purchase

          };

        }
      )

    );


  return {

    results:
      results,

    page:
      page,

    hasMore:
      hasMore

  };

}

// =========================================================
// TV作品 詳細取得
// =========================================================

async function getTvDetail(tvId, apiKey) {

  const url =
    "https://api.themoviedb.org/3/tv/" +
    tvId +
    "?api_key=" +
    apiKey +
    "&language=ja-JP" +
    "&append_to_response=credits,watch/providers";

  const tv =
    await fetchJson(url);


  // =======================================================
  // 日本の配信情報
  // =======================================================

  const providersData =
    tv["watch/providers"] &&
    tv["watch/providers"].results &&
    tv["watch/providers"].results.JP
      ? tv["watch/providers"].results.JP
      : {};


  const streaming =
    normalizeProviders(
      providersData.flatrate || []
    );

  const rental =
    normalizeProviders(
      providersData.rent || []
    );

  const purchase =
    normalizeProviders(
      providersData.buy || []
    );


  // =======================================================
  // 作品タイプ
  //
  // TMDBのジャンルID
  // 16 = Animation
  // =======================================================

  const genres =
    Array.isArray(tv.genres)
      ? tv.genres
      : [];


  const isAnime =
    genres.some(
      genre =>
        Number(genre.id) === 16 ||
        genre.name === "アニメーション"
      );


  const mediaType =
    isAnime
      ? "アニメ"
      : "ドラマ";


  // =======================================================
// 1話あたりの放送時間
// =======================================================

const episodeRunTime =
  Array.isArray(tv.episode_run_time)
    ? tv.episode_run_time
    : [];

const runtime =
  episodeRunTime.length > 0
    ? episodeRunTime[0]
    : 0;

  // =======================================================
  // シーズン情報
  // =======================================================

  const seasons =
    Array.isArray(tv.seasons)
      ? tv.seasons
          .filter(
            season =>
              Number(season.season_number) > 0
          )
          .map(
            season => ({
              season_number:
                Number(
                  season.season_number
                ),

              name:
                season.name ||
                (
                  "シーズン" +
                  season.season_number
                ),

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
            })
          )
      : [];
  

  // =======================================================
  // 制作者
  // =======================================================

  const creators =
    Array.isArray(tv.created_by)
      ? tv.created_by.map(
          person => person.name
        )
      : [];


  // =======================================================
  // 出演者
  // =======================================================

  const cast =
    tv.credits &&
    Array.isArray(tv.credits.cast)
      ? tv.credits.cast
          .slice(0, 10)
          .map(person => ({
            id: person.id,
            name: person.name,
            character: person.character || "",
            profile_path:
              person.profile_path || null
          }))
      : [];


  // =======================================================
  // 配信サービスURL
  // =======================================================

  const netflix =
  findProvider(
    streaming,
    rental,
    purchase,
    [
      "netflix"
    ]
  );


const amazon =
  findProvider(
    streaming,
    rental,
    purchase,
    [
      "amazon",
      "prime video"
    ]
  );


const unext =
  findProvider(
    streaming,
    rental,
    purchase,
    [
      "u-next",
      "unext"
    ]
  );


const hulu =
  findProvider(
    streaming,
    rental,
    purchase,
    [
      "hulu"
    ]
  );


const disney =
  findProvider(
    streaming,
    rental,
    purchase,
    [
      "disney"
    ]
  );


const apple =
  findProvider(
    streaming,
    rental,
    purchase,
    [
      "apple"
    ]
  );


const fod =
  findProvider(
    streaming,
    rental,
    purchase,
    [
      "fod"
    ]
  );


const googlePlay =
  findProvider(
    streaming,
    rental,
    purchase,
    [
      "google play",
      "google play movies",
      "google"
    ]
  );

  // =======================================================
  // TMDB作品ページ
  // =======================================================

  const tmdbLink =
    providersData.link ||
    (
      "https://www.themoviedb.org/tv/" +
      tvId +
      "?language=ja-JP"
    );


  // =======================================================
  // 詳細情報を返す
  // =======================================================

  return {

    id: tv.id,

    title:
      tv.name ||
      tv.original_name ||
      "",

    original_title:
      tv.original_name ||
      tv.name ||
      "",

    media_type:
      mediaType,

    runtime:
      runtime,

    release_date:
      tv.first_air_date ||
      "",

    poster_path:
      tv.poster_path ||
      null,

    backdrop_path:
      tv.backdrop_path ||
      null,

    overview:
      tv.overview ||
      "",

    vote_average:
      Number(
        tv.vote_average || 0
      ),

    original_language:
      tv.original_language ||
      "",

    genres:
      genres,

    creators:
      creators,

    cast:
      cast,

    number_of_seasons:
      Number(
        tv.number_of_seasons || 0
      ),

    number_of_episodes:
      Number(
        tv.number_of_episodes || 0
      ),

　　status:
  tv.status ||
  "",
    
    seasons:
      seasons,

    
    streaming:
      streaming,

    rental:
      rental,

    purchase:
      purchase,

    netflix_url:
      netflix
        ? netflix.provider_url
        : null,

    amazon_url:
      amazon
        ? amazon.provider_url
        : null,

    unext_url:
      unext
        ? unext.provider_url
        : null,

    hulu_url:
      hulu
        ? hulu.provider_url
        : null,

    disney_url:
      disney
        ? disney.provider_url
        : null,

    apple_url:
      apple
        ? apple.provider_url
        : null,

    fod_url:
      fod
        ? fod.provider_url
        : null,

    google_play_url:
      googlePlay
        ? googlePlay.provider_url
        : null,

    link:
      tmdbLink
  };
}
