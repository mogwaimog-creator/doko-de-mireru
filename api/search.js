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


const season =
  req.query &&
  typeof req.query.season === "string"
    ? Math.max(
        1,
        parseInt(req.query.season, 10) || 1
      )
    : 0;


const popular =
  req.query &&
  typeof req.query.popular === "string"
    ? req.query.popular.trim()
    : "";

// =====================================================
// 配信サービス
//
// netflix
// prime
// unext
// hulu
// disney
// =====================================================

const provider =
  req.query &&
  typeof req.query.provider === "string"
    ? req.query.provider
        .trim()
        .toLowerCase()
    : "";

// =====================================================
// 国・地域
//
// jp    = 日本
// kr    = 韓国
// other = 日本・韓国以外
// =====================================================

const country =
  req.query &&
  typeof req.query.country === "string"
    ? req.query.country
        .trim()
        .toLowerCase()
    : "";

// =====================================================
// Netflix ジャンル
//
// anime     = アニメ
// suspense  = サスペンス・ミステリー
// romance   = 恋愛・ラブコメ
// action    = アクション
// comedy    = コメディ
// horror    = ホラー
// scifi     = SF・ファンタジー
// =====================================================

const genre =
  req.query &&
  typeof req.query.genre === "string"
    ? req.query.genre
        .trim()
        .toLowerCase()
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
  if (
    type === "tv" ||
    type === "drama" ||
    type === "anime"
  ) {

    // ===================================================
    // シーズン指定がある場合
    //
    // 例:
    // ?id=12345&type=tv&season=1
    // ===================================================

    if (season > 0) {

      const result =
        await getTvSeason(
          id,
          season,
          apiKey
        );

      return res
        .status(200)
        .json(result);
    }


    const result =
      await getTvDetail(
        id,
        apiKey
      );

    return res
      .status(200)
      .json(result);
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
// Netflix 配信作品
// =====================================================

if (provider === "netflix") {

  const netflixResults =
  await getProviderWorks(
    apiKey,
    8,
    page,
    country,
    genre
  );

  return res
    .status(200)
    .json({
      results:
        netflixResults.results,

      page:
        netflixResults.page,

      hasMore:
        netflixResults.hasMore
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

// =====================================================
// ドラマ・アニメ検索
//
// movie  → 映画検索
// drama  → TV検索 + アニメーション除外
// anime  → TV検索 + アニメーションのみ
// tv     → TV検索
// =====================================================

// =====================================================
// すべて検索
//
// 映画
// ドラマ
// TVアニメ
// 劇場版アニメ
//
// をまとめて検索する
// =====================================================


// =====================================================
// 「すべて」検索用
//
// 映画検索はこの後の既存処理をそのまま使い、
// TV作品だけ先に取得しておく
// =====================================================

let allTvResults =
  null;


if (
  type === "all"
) {

  allTvResults =
    await searchTvShows(
      query,
      apiKey,
      page,
      "tv"
    );

}
    
if (
  type === "tv" ||
  type === "drama" ||
  type === "anime"
) {

  // =====================================================
  // アニメ検索
  //
  // TVアニメ
  // ＋
  // 劇場版アニメ
  //
  // の2種類を別々に取得
  // =====================================================

  if (type === "anime") {

    const tvAnime =
      await searchTvShows(
        query,
        apiKey,
        page,
        "anime"
      );


    const animeMovies =
      await searchAnimeMovies(
        query,
        apiKey,
        page
      );


    return res.status(200).json({

      // 既存互換用
      results:
        []
          .concat(
            tvAnime.results || []
          )
          .concat(
            animeMovies.results || []
          ),

      // TVアニメ
      tvAnime:
        tvAnime.results || [],

      // 劇場版アニメ
      animeMovies:
        animeMovies.results || [],

      page:
        page,

      hasMore:
        Boolean(
          tvAnime.hasMore ||
          animeMovies.hasMore
        )

    });

  }


  // =====================================================
  // ドラマ
  // =====================================================

  const tvResults =
    await searchTvShows(
      query,
      apiKey,
      page,
      type
    );


  return res.status(200).json({

    results:
      tvResults.results,

    page:
      tvResults.page,

    hasMore:
      tvResults.hasMore

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

// =====================================================
// 検索候補
//
// 表記ゆれ・別名を最初からすべて取得する
// =====================================================

const searchQueries =
  getTitleSearchAliases(query);


// 念のため元の検索語を先頭にする
if (
  query &&
  !searchQueries.includes(query)
) {

  searchQueries.unshift(query);

};


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
// 英語タイトル候補
// =====================================================

if (
  compactQuery ===
  "スターウォーズ"
) {

  if (
    !searchQueries.includes(
      "Star Wars"
    )
  ) {

    searchQueries.push(
      "Star Wars"
    );

  }

}

// =====================================================
// クレヨンしんちゃん 表記ゆれ
//
// クレヨンシンチャン
// クレヨンしんちゃん
// くれよんしんちゃん
//
// どの表記でも映画を検索できるようにする
// =====================================================

if (
  compactQuery === "クレヨンシンチャン" ||
  compactQuery === "クレヨンしんちゃん" ||
  compactQuery === "くれよんしんちゃん"
) {

  if (
    !searchQueries.includes(
      "クレヨンしんちゃん"
    )
  ) {

    searchQueries.push(
      "クレヨンしんちゃん"
    );

  }


  if (
    !searchQueries.includes(
      "Crayon Shin-chan"
    )
  ) {

    searchQueries.push(
      "Crayon Shin-chan"
    );

  }

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

      if (!movie.id) {
        return false;
      }

      if (!movie.title) {
        return false;
      }


      // =================================================
      // 中国語作品を除外
      //
      // zh = 中国語
      //
      // 日本語検索時に中国語圏の類似タイトルが
      // 混ざるのを防ぐ
      // =================================================

      if (
        String(
          movie.original_language || ""
        ).toLowerCase() === "zh"
      ) {

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
      isUnsafeAdultContent(movie)
    ) {
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

        // =================================================
    // 成人向け作品を除外
    // =================================================

    if (
      movie.adult === true
    ) {
      return false;
    }

    // 中国語作品を除外
    if (
      String(
        movie.original_language || ""
      ).toLowerCase() === "zh"
    ) {

      return false;

    }


    return true;
  });


// =====================================================
// 検索語と関係のない映画を除外
//
// 全作品共通
//
// 例:
// あいあんまん
// ↓
// アイアンマン
// アイアンマン2
// アイアンマン3
//
// のような関連タイトルだけを残す
// =====================================================

const normalizedMovieSearchQueries =
  searchQueries
    .map(function(value) {

      return normalizeTitle(
        value
      );

    })
    .filter(Boolean);


movies =
  movies.filter(
    function(movie) {

      if (!movie) {
        return false;
      }


      const titles = [
        movie.title || "",
        movie.original_title || ""
      ]
        .map(function(value) {

          return normalizeTitle(
            value
          );

        })
        .filter(Boolean);


      return titles.some(
        function(title) {

          return normalizedMovieSearchQueries.some(
            function(searchQuery) {

              if (
                !title ||
                !searchQuery
              ) {

                return false;

              }


              // 完全一致
              if (
                title === searchQuery
              ) {

                return true;

              }


              // アイアンマン2 など
              if (
                title.includes(
                  searchQuery
                )
              ) {

                return true;

              }


              // 検索語の方が長い場合
              if (
                title.length >= 3 &&
                searchQuery.includes(
                  title
                )
              ) {

                return true;

              }


              return false;

            }
          );

        }
      );

    }
  );
    
// =====================================================
// 検索関連度順
//
// ・日本語タイトル
// ・原題
// ・表記ゆれ
// ・完全一致
// ・先頭一致
// ・部分一致
// ・人気度
//
// を考慮する
// =====================================================

movies.sort(
  function(a, b) {

    const aScore =
      getTitleSearchScore(
        a,
        query,
        [
          "title",
          "original_title"
        ]
      );


    const bScore =
      getTitleSearchScore(
        b,
        query,
        [
          "title",
          "original_title"
        ]
      );


    return (
      bScore -
      aScore
    );

  }
);

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

  title:
    detailData.title ||
    movie.title ||
    "",

  media_type:
    "劇場版",

  content_type:
    "movie",

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
// 「すべて」の場合
//
// 映画 +
// ドラマ +
// TVアニメ
//
// をまとめる
//
// 劇場版アニメは通常の映画検索にも含まれる
// =====================================================

let finalResults =
  validResults;


if (
  type === "all" &&
  allTvResults &&
  Array.isArray(
    allTvResults.results
  )
) {

  finalResults =
    []
      .concat(
        validResults
      )
      .concat(
        allTvResults.results
      );

}    

// =====================================================
// JSON返却
// =====================================================

return res.status(200).json({

  results:
    finalResults,

  page:
    page,

  hasMore:
    finalResults.length >= 20

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

vote_count:
  Number(
    movie.vote_count || 0
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
// TV配信用 URL
// =========================================================

function createNetflixProviderUrl(
  provider,
  title
) {

  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    ) &&
    /netflix\./i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }

  return createNetflixUrl();

}


// =========================================================
// U-NEXT
// =========================================================

function createUnextProviderUrl(
  provider,
  title
) {

  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    ) &&
    /unext\./i.test(
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
    /unext\./i.test(
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
    /unext\./i.test(
      provider.link
    )
  ) {

    return provider.link;

  }

  return createUnextUrl();

}


// =========================================================
// Hulu
// =========================================================

function createHuluProviderUrl(
  provider,
  title
) {

  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    ) &&
    /hulu\./i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }

  return createHuluUrl(title);

}


// =========================================================
// Disney+
// =========================================================

function createDisneyProviderUrl(
  provider,
  title
) {

  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    ) &&
    /disneyplus\./i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }

  return createDisneyUrl(title);

}


// =========================================================
// Apple TV
// =========================================================

function createAppleProviderUrl(
  provider,
  title
) {

  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(
      provider.provider_url
    ) &&
    /apple\./i.test(
      provider.provider_url
    )
  ) {

    return provider.provider_url;

  }

  return createAppleUrl(title);

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
// 有名作品の検索表記ゆれ補正
//
// 入力ミス・カタカナ表記などを補正する
// =========================================================

function getTitleSearchAliases(query) {

  const original =
    String(query || "").trim();

  const normalized =
    normalizeTitle(original);


  const aliases = [];


  function add(value) {

    if (
      value &&
      !aliases.includes(value)
    ) {

      aliases.push(value);

    }

  }


  // 元の検索語
  add(original);

  // =======================================================
// 全作品共通
// ひらがな → カタカナ検索候補
//
// 例:
// あいあんまん → アイアンマン
// すぱいだーまん → スパイダーマン
// たーみねーたー → ターミネーター
// =======================================================

const katakanaQuery =
  original.replace(
    /[\u3041-\u3096]/g,
    function(char) {

      return String.fromCharCode(
        char.charCodeAt(0) +
        0x60
      );

    }
  );


add(katakanaQuery);

  // =======================================================
  // ドラえもん
  //
  // ドラエモン
  // どらえもん
  // Doraemon
  // =======================================================

  if (
    normalized === "ドラエモン" ||
    normalized === "ドラえもん" ||
    normalized === "どらえもん" ||
    normalized === "doraemon"
  ) {

    add("ドラえもん");
    add("Doraemon");

  }


  // =======================================================
  // クレヨンしんちゃん
  //
  // クレヨンシンチャン
  // くれよんしんちゃん
  // =======================================================

  if (
    normalized === "クレヨンシンチャン" ||
    normalized === "クレヨンしんちゃん" ||
    normalized === "くれよんしんちゃん" ||
    normalized === "しんちゃん"
  ) {

    add("クレヨンしんちゃん");
    add("Crayon Shin-chan");

  }


  // =======================================================
  // 名探偵コナン
  //
  // 「コナン」で検索した場合も
  // 名探偵コナンを検索候補に追加
  // =======================================================

  if (
    normalized === "コナン" ||
    normalized === "名探偵コナン" ||
    normalized === "めいたんていコナン"
  ) {

    add("名探偵コナン");
    add("Detective Conan");
    add("Case Closed");

  }


  // =======================================================
// ONE PIECE / ワンピース
//
// ワンピース
// わんぴーす
// ONE PIECE
// One Piece
// =======================================================

if (
  normalized === "ワンピース" ||
  normalized === "わんぴーす" ||
  normalized === "onepiece"
) {

  add("ONE PIECE");
  add("One Piece");
  add("ワンピース");

}
  
// =======================================================
// 君の名は。
// =======================================================

if (
  normalized === "君ノ名ハ" ||
  normalized === "君ノナハ" ||
  normalized === "キミノナハ" ||
  normalized === "yourname"
) {

  add("君の名は。");
  add("君の名は");
  add("Your Name");

}


  
  return aliases;

}

// =========================================================
// タイトル正規化
// =========================================================

function normalizeTitle(title) {

  let value =
    String(
      title || ""
    );


  // =====================================================
  // Unicode正規化
  //
  // 全角英数字
  // 半角英数字
  // 全角記号
  //
  // などの違いをできるだけ統一
  // =====================================================

  try {

    value =
      value.normalize("NFKC");

  } catch (error) {

    // 古い環境などでnormalizeが使えない場合は
    // そのまま続行

  }


  value =
    value
      .toLowerCase()

      // ---------------------------------------------------
      // 空白を削除
      // ---------------------------------------------------

      .replace(
        /[\s　]/g,
        ""
      )

      // ---------------------------------------------------
      // タイトル検索では意味の薄い記号を削除
      // ---------------------------------------------------

      .replace(
        /[「」『』【】〔〕［］\[\]（）()〈〉《》＜＞<>・･:：;；!?！？,.，。、'"“”‘’`´\-‐-‒–—―~〜～／\/\\]/g,
        ""
      );


  // =====================================================
  // ひらがな → カタカナ
  //
  // 例:
  //
  // どらえもん
  // ↓
  // ドラエモン
  // =====================================================

  value =
    value.replace(
      /[\u3041-\u3096]/g,
      function(char) {

        return String.fromCharCode(
          char.charCodeAt(0) +
          0x60
        );

      }
    );


  return value;

}

// =========================================================
// 一般向けサイト用
// 成人向け・性的作品の除外
//
// TMDBの adult=false だけでは
// 一部の成人向け作品が残る場合があるため
// タイトル・原題・あらすじも確認する
// =========================================================

function isUnsafeAdultContent(item) {

  if (!item) {
    return false;
  }


  // TMDBの成人向けフラグ
  if (item.adult === true) {
    return true;
  }


  const text =
    [
      item.title,
      item.original_title,
      item.name,
      item.original_name,
      item.overview
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();


  const blockedWords = [
    "porn",
    "porno",
    "pornography",
    "xxx",
    "adult video",
    "av女優",
    "av男優",
    "アダルトビデオ",
    "ポルノ",
    "官能",
    "sex film",
    "erotic movie"
  ];


  return blockedWords.some(
    function(word) {

      return text.includes(
        word.toLowerCase()
      );

    }
  );

}

// =========================================================
// 検索候補を正規化してまとめる
//
// 元の検索語
// ＋
// 表記ゆれ
// ＋
// 別名
//
// を同じ基準で比較できるようにする
// =========================================================

function getNormalizedSearchCandidates(query) {

  const candidates = [];


  function add(value) {

    const normalized =
      normalizeTitle(
        value
      );


    if (
      normalized &&
      !candidates.includes(
        normalized
      )
    ) {

      candidates.push(
        normalized
      );

    }

  }


  // =======================================================
  // 元の検索語
  // =======================================================

  add(query);


  // =======================================================
  // 登録済みの表記ゆれ
  //
  // ドラえもん
  // クレヨンしんちゃん
  // 名探偵コナン
  // ONE PIECE
  // など
  // =======================================================

  const aliases =
    getTitleSearchAliases(
      query
    );


  aliases.forEach(
    function(alias) {

      add(alias);

    }
  );


  return candidates;

}


// =========================================================
// タイトル検索関連度
//
// 数字が大きい作品ほど上に表示する
// =========================================================

function getTitleSearchScore(
  item,
  query,
  titleKeys
) {

  if (!item) {
    return -999999;
  }


  const searchCandidates =
    getNormalizedSearchCandidates(
      query
    );


  const titles = [];


  titleKeys.forEach(
    function(key) {

      if (
        item[key]
      ) {

        const normalized =
          normalizeTitle(
            item[key]
          );


        if (
          normalized &&
          !titles.includes(
            normalized
          )
        ) {

          titles.push(
            normalized
          );

        }

      }

    }
  );


  let score = 0;


  titles.forEach(
    function(title) {

      searchCandidates.forEach(
        function(searchQuery) {

          if (
            !title ||
            !searchQuery
          ) {

            return;

          }


          // =================================================
          // 完全一致
          // =================================================

          if (
            title === searchQuery
          ) {

            score =
              Math.max(
                score,
                100000
              );

            return;

          }


          // =================================================
          // タイトル先頭一致
          //
          // 例:
          //
          // コナン
          // →
          // コナン○○
          // =================================================

          if (
            title.startsWith(
              searchQuery
            )
          ) {

            score =
              Math.max(
                score,
                50000
              );

            return;

          }


          // =================================================
          // タイトルの中に検索語
          // =================================================

          if (
            title.includes(
              searchQuery
            )
          ) {

            score =
              Math.max(
                score,
                30000
              );

            return;

          }


          // =================================================
          // 検索語の中にタイトル
          //
          // 短すぎるタイトルは誤判定を防ぐ
          // =================================================

          if (
            title.length >= 3 &&
            searchQuery.includes(
              title
            )
          ) {

            score =
              Math.max(
                score,
                15000
              );

          }

        }
      );

    }
  );


  // =======================================================
  // TMDB人気度
  //
  // 同程度に一致している作品なら
  // 有名作品を少し優先
  // =======================================================

  score +=
    Math.min(
      Number(
        item.popularity || 0
      ),
      500
    );


  // =======================================================
  // TMDB評価
  // =======================================================

  score +=
    Number(
      item.vote_average || 0
    );


  return score;

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
// 配信サービス別作品取得
//
// providerId
// 8 = Netflix
//
// ・日本で見放題配信中の映画
// ・日本で見放題配信中のドラマ
// ・日本で見放題配信中のアニメ
//
// をまとめて取得する
// ========================================================

async function getProviderWorks(
  apiKey,
  providerId,
  page,
  country,
  genre
) {

    // =======================================================
  // Netflix ジャンル
  //
  // まずはアニメだけ対応
  // TMDB genre 16 = Animation
  // =======================================================

  const movieGenreQuery =
  genre === "anime"
    ? "&with_genres=16&with_original_language=ja"
    : "";

const tvGenreQuery =
  genre === "anime"
    ? "&with_genres=16&with_original_language=ja"
    : "";
    
  // =======================================================
  // 国・地域による絞り込み
  //
  // jp = 日本
  // kr = 韓国
  // other = 日本・韓国以外
  // =======================================================

  let originalLanguage = "";

  if (country === "jp") {
    originalLanguage = "ja";
  }
  else if (country === "kr") {
    originalLanguage = "ko";
  }

　// 国・地域から探す場合はアニメを除外
// ただし「アニメ」を選択している場合は除外しない
const countryWithoutAnimation =
  country && genre !== "anime"
    ? "&without_genres=16"
    : "";
  
// =======================================================
// 映画
// =======================================================

const movieUrl =
  "https://api.themoviedb.org/3/discover/movie" +
  "?api_key=" +
  encodeURIComponent(apiKey) +
  "&language=ja-JP" +
  "&region=JP" +
  "&watch_region=JP" +
  "&with_watch_providers=" +
  encodeURIComponent(providerId) +
  "&with_watch_monetization_types=flatrate" +
  "&sort_by=popularity.desc" +
  (
    originalLanguage
      ? "&with_original_language=" +
        encodeURIComponent(originalLanguage)
      : ""
  ) +
 countryWithoutAnimation +
movieGenreQuery +
"&page=" +
encodeURIComponent(page);

// =======================================================
// TV
// =======================================================

const tvUrl =
  "https://api.themoviedb.org/3/discover/tv" +
  "?api_key=" +
  encodeURIComponent(apiKey) +
  "&language=ja-JP" +
  "&watch_region=JP" +
  "&with_watch_providers=" +
  encodeURIComponent(providerId) +
  "&with_watch_monetization_types=flatrate" +
  "&sort_by=popularity.desc" +
  (
    originalLanguage
      ? "&with_original_language=" +
        encodeURIComponent(originalLanguage)
      : ""
  ) +
  countryWithoutAnimation +
tvGenreQuery +
"&page=" +
encodeURIComponent(page);

  // =======================================================
  // 配信サービスのロゴ・名前
  // =======================================================

  const providerUrl =
    "https://api.themoviedb.org/3/watch/providers/movie" +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&watch_region=JP";


  const [
    movieData,
    tvData,
    providerData
  ] =
    await Promise.all([
      fetchJson(movieUrl),
      fetchJson(tvUrl),
      fetchJson(providerUrl)
    ]);


  // =======================================================
  // 配信サービス情報
  // =======================================================

  const providers =
    providerData &&
    Array.isArray(
      providerData.results
    )
      ? providerData.results
      : [];


  const provider =
    providers.find(
      function(item){

        return (
          Number(item.provider_id) ===
          Number(providerId)
        );

      }
    );


  const streamingProvider =
    provider
      ? {
          provider_id:
            provider.provider_id,

          provider_name:
            provider.provider_name,

          logo_path:
            provider.logo_path || null
        }
      : null;


  // =======================================================
  // 映画
  // =======================================================

  const movieResults =
    movieData &&
    Array.isArray(
      movieData.results
    )
      ? movieData.results
          .slice(0, 10)
          .map(
            function(movie){

              const genreIds =
                Array.isArray(
                  movie.genre_ids
                )
                  ? movie.genre_ids
                  : [];


              const isAnime =
                genreIds.includes(16);


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

original_language:
  movie.original_language ||
  "",

overview:
  movie.overview ||
  "",

                poster_path:
                  movie.poster_path ||
                  null,

                release_date:
                  movie.release_date ||
                  "",

                vote_average:
                  Number(
                    movie.vote_average || 0
                  ),

                runtime:
                  0,

                media_type:
                  isAnime
                    ? "劇場版アニメ"
                    : "劇場版",

                content_type:
                  isAnime
                    ? "anime_movie"
                    : "movie",

                streaming:
                  streamingProvider
                    ? [
                        streamingProvider
                      ]
                    : [],

                rental:
                  [],

                purchase:
                  []

              };

            }
          )
      : [];


  // =======================================================
  // TV
  // =======================================================

  const tvResults =
    tvData &&
    Array.isArray(
      tvData.results
    )
      ? tvData.results
          .slice(0, 10)
          .map(
            function(show){

              const genreIds =
                Array.isArray(
                  show.genre_ids
                )
                  ? show.genre_ids
                  : [];


              const isAnime =
                genreIds.includes(16);


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

original_language:
  show.original_language ||
  "",

overview:
  show.overview ||
  "",

                poster_path:
                  show.poster_path ||
                  null,

                release_date:
                  show.first_air_date ||
                  "",

                vote_average:
                 Number(
                   show.vote_average || 0
                ),

              vote_count:
               Number(
                 show.vote_count || 0
               ),

              runtime:
               0,

                media_type:
                  isAnime
                    ? "TVアニメ"
                    : "TV",

                content_type:
                  isAnime
                    ? "anime_tv"
                    : "tv_drama",

                streaming:
                  streamingProvider
                    ? [
                        streamingProvider
                      ]
                    : [],

                rental:
                  [],

                purchase:
                  []

              };

            }
          )
      : [];


  // =======================================================
  // 映画 + TV
  // =======================================================

  let results =
  []
    .concat(
      movieResults
    )
    .concat(
      tvResults
    );


// =======================================================
// 洋画・海外ドラマ
//
// 日本語作品・韓国語作品を除外
// =======================================================

if (country === "other") {

  results =
    results.filter(
      function(item){

        return (
          item.original_language !== "ja" &&
          item.original_language !== "ko"
        );

      }
    );

}


  // =======================================================
  // 人気順
  // =======================================================

  results.sort(
    function(a, b){

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
  // 続きがあるか
  // =======================================================

  const movieHasMore =
    movieData &&
    Number(movieData.page) <
    Number(movieData.total_pages);


  const tvHasMore =
    tvData &&
    Number(tvData.page) <
    Number(tvData.total_pages);


  return {

    results:
      results,

    page:
      page,

    hasMore:
      Boolean(
        movieHasMore ||
        tvHasMore
      )

  };

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
// 劇場版アニメ検索
//
// TMDB /search/movie を使用
//
// TMDBのAnimationジャンル
// ID:16
//
// アニメ検索時に
// TVアニメとは別に劇場版アニメを取得する
// =========================================================

async function searchAnimeMovies(
  query,
  apiKey,
  page
) {

  // =======================================================
  // 検索候補
  // =======================================================

  // =======================================================
// 検索候補
//
// TVアニメと同じ表記ゆれ・別名処理を使用する
// =======================================================

const searchQueries =
  getTitleSearchAliases(query);


if (
  query &&
  !searchQueries.includes(query)
) {

  searchQueries.unshift(
    query
  );

}


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
  // TMDB検索
  // =======================================================

  let allMovies = [];

  let hasMore = false;


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

        // =================================================
        // Animationジャンルだけ残す
        //
        // TMDB
        // 16 = Animation
        // =================================================

        const animeResults =
          data.results.filter(
            function(movie) {

              if (
                !movie ||
                !movie.id ||
                !movie.title
              ) {

                return false;

              }


              const genreIds =
                Array.isArray(
                  movie.genre_ids
                )
                  ? movie.genre_ids.map(
                      function(id) {
                        return Number(id);
                      }
                    )
                  : [];


              return genreIds.includes(16);

            }
          );


        allMovies =
          allMovies.concat(
            animeResults
          );


        // =================================================
        // 次ページ確認
        // =================================================

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
        "TMDB ANIME MOVIE SEARCH ERROR:",
        error
      );

    }

  }


  // =======================================================
  // 重複削除
  // =======================================================

  const movieMap =
    new Map();


  allMovies.forEach(
    function(movie) {

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

    }
  );


  let movies =
    Array.from(
      movieMap.values()
    );


  // =======================================================
  // 完全一致を優先
  // =======================================================

  const normalizedQuery =
    normalizeTitle(
      query
    );

// =====================================================
// 検索語との関連性が低い作品を除外
//
// 全作品共通
//
// 例:
// あいあんまん
// ↓
// アイアンマン系の作品を残し、
// 無関係な作品が大量に混ざるのを防ぐ
// =====================================================

const searchAliasTitles =
  getTitleSearchAliases(query)
    .map(function(alias) {

      return normalizeTitle(alias);

    })
    .filter(Boolean);


movies =
  movies.filter(function(movie) {

    const movieTitle =
      normalizeTitle(
        movie.title || ""
      );

    const originalTitle =
      normalizeTitle(
        movie.original_title || ""
      );


    return searchAliasTitles.some(
      function(alias) {

        return (
          movieTitle.includes(alias) ||
          alias.includes(movieTitle) ||
          originalTitle.includes(alias) ||
          alias.includes(originalTitle)
        );

      }
    );

  });

  
  movies.sort(
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

  movies =
    movies.slice(
      0,
      20
    );


  // =======================================================
  // 詳細・配信情報取得
  // =======================================================

  const results =
    await Promise.all(

      movies.map(
        async function(movie) {

          let runtime = 0;

          let streaming = [];

          let rental = [];

          let purchase = [];

          let detailData = null;


          try {

            const detailUrl =
              "https://api.themoviedb.org/3/movie/" +
              encodeURIComponent(
                movie.id
              ) +
              "?api_key=" +
              encodeURIComponent(apiKey) +
              "&language=ja-JP" +
              "&append_to_response=watch/providers";


            detailData =
              await fetchJson(
                detailUrl
              );


            if (
              !detailData ||
              !detailData.id ||
              detailData.id !== movie.id ||
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
                detailData[
                  "watch/providers"
                ].results.JP;

            }


            streaming =
              normalizeProviders(
                providersJP.flatrate
              );


            rental =
              normalizeProviders(
                providersJP.rent
              );


            purchase =
              normalizeProviders(
                providersJP.buy
              );


          } catch (error) {

            console.error(
              "ANIME MOVIE DETAIL ERROR:",
              movie.id,
              movie.title,
              error
            );

            return null;

          }


          // =================================================
          // 劇場版アニメとして返却
          // =================================================

          return {

            id:
              movie.id,

            title:
              detailData.title ||
              movie.title ||
              "",

            original_title:
              detailData.original_title ||
              movie.original_title ||
              "",

            media_type:
              "劇場版アニメ",

            content_type:
              "anime_movie",

            runtime:
              runtime,

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
              ),

            original_language:
              detailData.original_language ||
              movie.original_language ||
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


  // =======================================================
  // null除外
  // =======================================================

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


  return {

    results:
      validResults,

    page:
      page,

    hasMore:
      hasMore

  };

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
  page,
  type
) {
  
  // =======================================================
  // 検索候補
  // =======================================================

  const searchQueries =
  getTitleSearchAliases(
    query
  );


// =======================================================
// 元の検索語
//
// getTitleSearchAliases() で
// 表記ゆれも同時に追加する
// =======================================================

if (
  !searchQueries.includes(query)
) {

  searchQueries.unshift(
    query
  );

}


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
// 検索語と無関係な作品を除外
//
// TMDB検索では、検索語とあまり関係のない作品が
// 混ざる場合があるため、
//
// ・日本語タイトル
// ・原題
//
// のどちらかが検索候補と一致・部分一致する作品だけ残す
// =======================================================

const normalizedSearchQueries =
  searchQueries
    .map(function(value) {

      return normalizeTitle(
        value
      );

    })
    .filter(Boolean);


shows =
  shows.filter(
    function(show) {

      if (!show) {
        return false;
      }


      if (
        isUnsafeAdultContent(show)
      ) {
        return false;
      }


      const titles = [
        show.name || "",
        show.original_name || ""
      ]
        .map(function(value) {

          return normalizeTitle(
            value
          );

        })
        .filter(Boolean);


      // =================================================
      // 検索候補のどれかとタイトルが関連しているか
      // =================================================

      return titles.some(
        function(title) {

          return normalizedSearchQueries.some(
            function(searchQuery) {

              if (
                !title ||
                !searchQuery
              ) {

                return false;

              }


              // 完全一致
              if (
                title === searchQuery
              ) {

                return true;

              }


              // タイトルの中に検索語が入っている
              if (
                title.includes(
                  searchQuery
                )
              ) {

                return true;

              }


              // 検索語の中にタイトルが入っている
              // 短すぎるタイトルは誤判定防止のため除外
              if (
                title.length >= 3 &&
                searchQuery.includes(
                  title
                )
              ) {

                return true;

              }


              return false;

            }
          );

        }
      );

    }
  );

// =======================================================
// 検索関連度で並び替え
//
// ・完全一致
// ・タイトル先頭一致
// ・タイトル部分一致
// ・有名作品の表記ゆれ
//
// を考慮する
// =======================================================

const normalizedQuery =
  normalizeTitle(
    query
  );


function getSearchScore(show) {

  const title =
    normalizeTitle(
      show.name ||
      show.original_name ||
      ""
    );


  const originalTitle =
    normalizeTitle(
      show.original_name ||
      ""
    );


  let score = 0;


  // =====================================================
  // 通常の関連度
  // =====================================================

  if (
    title === normalizedQuery
  ) {

    score += 10000;

  }


  if (
    title.startsWith(
      normalizedQuery
    )
  ) {

    score += 3000;

  }


  if (
    title.includes(
      normalizedQuery
    )
  ) {

    score += 1500;

  }


  if (
    originalTitle.includes(
      normalizedQuery
    )
  ) {

    score += 500;

  }


  // =====================================================
  // 「コナン」
  //
  // 一般的な検索意図として
  // 名探偵コナンを優先
  // =====================================================

  if (
    normalizedQuery === "コナン"
  ) {

    if (
      title === "名探偵コナン"
    ) {

      score += 20000;

    } else if (
      title.includes(
        "名探偵コナン"
      )
    ) {

      score += 10000;

    }


    // 未来少年コナンを削除するのではなく
    // 順位だけ下げる
    if (
      title.includes(
        "未来少年コナン"
      )
    ) {

      score -= 5000;

    }

  }


  // =====================================================
  // ドラえもん
  // =====================================================

  if (
    normalizedQuery === "ドラエモン" ||
    normalizedQuery === "ドラえもん" ||
    normalizedQuery === "どらえもん"
  ) {

    if (
      title.includes(
        "ドラえもん"
      )
    ) {

      score += 10000;

    }

  }


  // =====================================================
  // クレヨンしんちゃん
  // =====================================================

  if (
    normalizedQuery === "クレヨンシンチャン" ||
    normalizedQuery === "クレヨンしんちゃん" ||
    normalizedQuery === "くれよんしんちゃん" ||
    normalizedQuery === "しんちゃん"
  ) {

    if (
      title.includes(
        "クレヨンしんちゃん"
      )
    ) {

      score += 10000;

    }

  }


  // =====================================================
  // TMDB評価
  //
  // 同程度の関連度なら評価の高い作品を優先
  // =====================================================

  score +=
    Number(
      show.vote_average || 0
    );


  return score;

}


shows.sort(
  function(a, b) {

    return (
      getSearchScore(b) -
      getSearchScore(a)
    );

  }
);


   // =======================================================
  // ドラマ・アニメの振り分け
  //
  // TMDBジャンルID
  //
  // 16 = Animation
  //
  // anime
  // → アニメーション作品のみ
  //
  // drama
  // → アニメーション以外
  // =======================================================

// =======================================================
// ドラマ・アニメの振り分け
//
// TMDBジャンルID
//
// 16    = Animation
// 18    = Drama
// 35    = Comedy
// 80    = Crime
// 9648  = Mystery
// 10749 = Romance
// 10759 = Action & Adventure
// 10765 = Sci-Fi & Fantasy
// 10768 = War & Politics
// 37    = Western
//
// ドラマ検索では
// ニュース・トーク・リアリティなどを除外
// =======================================================

shows =
  shows.filter(
    function(show) {

      const genreIds =
        Array.isArray(show.genre_ids)
          ? show.genre_ids.map(
              function(id) {
                return Number(id);
              }
            )
          : [];


      // =================================================
      // アニメ
      // =================================================

      const isAnime =
        genreIds.includes(16);


      // =================================================
      // TVアニメ
      // =================================================

      if (type === "anime") {

        return isAnime;

      }


      // =================================================
      // ドラマ
      // =================================================

      if (type === "drama") {

        // アニメは除外
        if (isAnime) {
          return false;
        }


        // -----------------------------------------------
        // ドラマとして扱うジャンル
        // -----------------------------------------------

        const dramaGenres = [
          18,      // Drama
          35,      // Comedy
          80,      // Crime
          9648,    // Mystery
          10749,   // Romance
          10759,   // Action & Adventure
          10765,   // Sci-Fi & Fantasy
          10768,   // War & Politics
          37       // Western
        ];


        const isDrama =
          genreIds.some(
            function(genreId) {

              return dramaGenres.includes(
                genreId
              );

            }
          );


        // -----------------------------------------------
        // ドラマ系ジャンルがある場合のみ採用
        // -----------------------------------------------

        if (isDrama) {
          return true;
        }


        // -----------------------------------------------
// ジャンル情報がない作品は
// ドラマとして判定できないため除外
//
// アニメ作品がドラマへ混ざるのを防ぐ
// -----------------------------------------------

if (!genreIds.length) {
  return false;
}

return false;
      }


      // =================================================
      // type=tv
      //
      // TV作品をそのまま返す
      // =================================================

      return true;

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
// ドラマ検索時の最終アニメ除外
//
// 検索APIの genre_ids が空の場合でも、
// TV詳細APIの genres を使って再判定する
//
// TMDB
// 16 = Animation
// =================================================

if (
  type === "drama"
) {

  const detailGenres =
    Array.isArray(
      detailData.genres
    )
      ? detailData.genres
      : [];


  const isAnimation =
    detailGenres.some(
      function(genre) {

        return (
          Number(genre.id) === 16 ||
          String(
            genre.name || ""
          ).toLowerCase() ===
            "animation" ||
          String(
            genre.name || ""
          ) ===
            "アニメーション"
        );

      }
    );


  if (isAnimation) {

    return null;

  }

}

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
    type === "anime"
      ? "TVアニメ"
      : "TV",


  content_type:
  type === "anime"
    ? "anime_tv"
    : (
        type === "drama"
          ? "tv_drama"
          : "tv"
      ),


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

// =======================================================
// nullを除外
//
// ドラマ検索時にアニメと判定された作品などを除外
// =======================================================

const validResults =
  results.filter(
    function(show) {

      return (
        show &&
        show.id &&
        show.title
      );

    }
  );

  
  return {

    results:
      validResults,

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
  // 関連シリーズ
  //
  // アニメ
  // → 同じ作品の劇場版を取得
  //
  // ドラマ
  // → これまで通り関連TVシリーズを取得
  // =======================================================

  let series = [];


  try {

    if (isAnime) {

      // ===================================================
      // TVアニメの場合
      //
      // 名探偵コナン
      // クレヨンしんちゃん
      // ドラえもん
      //
      // などの劇場版を取得
      // ===================================================

      series =
        await getAnimeRelatedMovies(
          tv,
          apiKey
        );

    } else {

      // ===================================================
      // ドラマの場合
      //
      // 今まで通り
      // 関連TVシリーズを取得
      // ===================================================

      series =
        await getTvRelatedSeries(
          tvId,
          apiKey
        );

    }

  } catch (error) {

    console.error(
      "TV RELATED SERIES ERROR:",
      error
    );

    series = [];

  }

    // =======================================================
  // おすすめ作品
  //
  // TMDB recommendations を使用
  //
  // ドラマ・TVアニメ共通
  // =======================================================

  let recommendations = [];


  try {

    recommendations =
      await getTvRecommendations(
        tvId,
        apiKey
      );

  } catch (error) {

    console.error(
      "TV RECOMMENDATIONS ERROR:",
      error
    );

    recommendations = [];

  }
  
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
  // 配信サービスURL
  //
  // TMDBから作品URLが取得できる場合は優先
  // 取得できない場合は各サービスの検索ページへ
  // =======================================================

  const tvTitle =
    tv.name ||
    tv.original_name ||
    "";


  // =======================================================
  // Netflix
  // =======================================================

  const netflixUrl =
    netflix
      ? createNetflixProviderUrl(
          netflix,
          tvTitle
        )
      : null;


  // =======================================================
  // Amazon Prime Video
  // =======================================================

  const amazonUrl =
    amazon
      ? createAmazonUrl(
          amazon,
          tvTitle
        )
      : null;


  // =======================================================
  // U-NEXT
  // =======================================================

  const unextUrl =
    unext
      ? createUnextProviderUrl(
          unext,
          tvTitle
        )
      : null;


  // =======================================================
  // Hulu
  // =======================================================

  const huluUrl =
    hulu
      ? createHuluProviderUrl(
          hulu,
          tvTitle
        )
      : null;


  // =======================================================
  // Disney+
  // =======================================================

  const disneyUrl =
    disney
      ? createDisneyProviderUrl(
          disney,
          tvTitle
        )
      : null;


  // =======================================================
  // Apple TV
  // =======================================================

  const appleUrl =
    apple
      ? createAppleProviderUrl(
          apple,
          tvTitle
        )
      : null;


  // =======================================================
  // FOD
  // =======================================================

  const fodUrl =
    fod
      ? createFodUrl(
          fod,
          tvTitle
        )
      : null;


  // =======================================================
  // Google Play
  // =======================================================

  const googlePlayUrl =
    googlePlay
      ? createGooglePlayUrl(
          googlePlay,
          tvTitle
        )
      : null;


  // =======================================================
  // 詳細情報を返す
  // =======================================================

  return {

    id:
      tv.id,

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

    content_type:
      isAnime
        ? "anime_tv"
        : "tv_drama",

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
  formatTvStatus(tv),

    
        seasons:
      seasons,


    // ===================================================
    // 関連シリーズ
    // ===================================================

    series:
      series,


        // ===================================================
    // おすすめ作品
    // ===================================================

    recommendations:
      recommendations,
    
    // ===================================================
    // 配信情報
    // ===================================================

    streaming:
      streaming,

    rental:
      rental,

    purchase:
      purchase,

    // ===================================================
    // 配信サービスURL
    // ===================================================

    netflix_url:
      netflixUrl,

    amazon_url:
      amazonUrl,

    unext_url:
      unextUrl,

    hulu_url:
      huluUrl,

    disney_url:
      disneyUrl,

    apple_url:
      appleUrl,

    fod_url:
      fodUrl,

    google_play_url:
      googlePlayUrl,

    // ===================================================
    // TMDB
    // ===================================================

    link:
      tmdbLink

  };

}

// =========================================================
// アニメ劇場版取得
//
// TVアニメのタイトルから
// 同じ作品の映画シリーズを探す
//
// 例:
//
// 名探偵コナン
// → 名探偵コナン 劇場版シリーズ
//
// クレヨンしんちゃん
// → クレヨンしんちゃん 劇場版シリーズ
//
// ドラえもん
// → ドラえもん 劇場版シリーズ
//
// TVアニメの「おすすめ作品」ではなく
// 同じ作品の劇場版を優先して取得する
// =========================================================

// =========================================================
// アニメ劇場版取得【安定版】
//
// TVアニメのタイトルから
// 同じ作品の劇場版シリーズを探す
//
// 例:
//
// 名探偵コナン
// → 名探偵コナン 劇場版シリーズ
//
// クレヨンしんちゃん
// → クレヨンしんちゃん 劇場版シリーズ
//
// ドラえもん
// → ドラえもん 劇場版シリーズ
//
// ポイント:
//
// ・TVアニメ自身は除外
// ・映画作品だけを対象
// ・belongs_to_collection を優先
// ・TVタイトルとコレクション名を比較
// ・コレクション名だけでなく映画タイトルも確認
// ・関係のないアニメ映画を混ぜない
// =========================================================

async function getAnimeRelatedMovies(
  tv,
  apiKey
) {

  if (
    !tv ||
    !tv.id
  ) {

    return [];

  }


  // =======================================================
  // TVアニメタイトル
  // =======================================================

  const tvTitle =
    tv.name ||
    tv.original_name ||
    "";


  const tvOriginalTitle =
    tv.original_name ||
    "";


  if (!tvTitle) {

    return [];

  }


  // =======================================================
  // タイトル正規化
  // =======================================================

  const normalizedTvTitle =
    normalizeTitle(
      tvTitle
    );


  const normalizedOriginalTitle =
    normalizeTitle(
      tvOriginalTitle
    );


  // =======================================================
  // 検索候補
  // =======================================================

  const searchQueries = [];


  function addSearchQuery(value) {

    if (
      !value
    ) {

      return;

    }


    if (
      !searchQueries.includes(
        value
      )
    ) {

      searchQueries.push(
        value
      );

    }

  }


  addSearchQuery(
    tvTitle
  );


  addSearchQuery(
    tvOriginalTitle
  );


  const compactTitle =
    normalizeSearchQuery(
      tvTitle
    );


  addSearchQuery(
    compactTitle
  );


  const spacedTitle =
    createSpacedSearchQuery(
      compactTitle
    );


  addSearchQuery(
    spacedTitle
  );


  const middleDotTitle =
    createMiddleDotSearchQuery(
      compactTitle
    );


  addSearchQuery(
    middleDotTitle
  );


  // =======================================================
  // 映画検索
  // =======================================================

  let movieCandidates = [];


  for (
    let i = 0;
    i < searchQueries.length;
    i++
  ) {

    const searchQuery =
      searchQueries[i];


    if (!searchQuery) {

      continue;

    }


    const searchUrl =
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" +
      encodeURIComponent(
        apiKey
      ) +
      "&language=ja-JP" +
      "&region=JP" +
      "&include_adult=false" +
      "&page=1" +
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

        movieCandidates =
          movieCandidates.concat(
            data.results
          );

      }

    } catch (error) {

      console.error(
        "ANIME RELATED MOVIE SEARCH ERROR:",
        error
      );

    }

  }


  // =======================================================
  // 重複削除
  // =======================================================

  const movieMap =
    new Map();


  movieCandidates.forEach(
    function(movie) {

      if (
        !movie ||
        !movie.id ||
        !movie.title
      ) {

        return;

      }


      // TV作品自身と同じIDは除外
      if (
        String(movie.id) ===
        String(tv.id)
      ) {

        return;

      }


      movieMap.set(
        String(movie.id),
        movie
      );

    }
  );


  const uniqueMovies =
    Array.from(
      movieMap.values()
    );


  // =======================================================
  // 映画詳細取得
  //
  // 最大30件まで確認
  //
  // 以前の20件より少し増やして
  // コナン・しんちゃん・ドラえもんなどの
  // 劇場版シリーズを見つけやすくする
  // =======================================================

  const moviesToCheck =
    uniqueMovies.slice(
      0,
      30
    );


  const movieDetails =
    await Promise.all(

      moviesToCheck.map(
        async function(movie) {

          try {

            const detailUrl =
              "https://api.themoviedb.org/3/movie/" +
              encodeURIComponent(
                movie.id
              ) +
              "?api_key=" +
              encodeURIComponent(
                apiKey
              ) +
              "&language=ja-JP";


            const detail =
              await fetchJson(
                detailUrl
              );


            if (
              !detail ||
              !detail.id
            ) {

              return null;

            }


            return detail;

          } catch (error) {

            console.error(
              "ANIME RELATED MOVIE DETAIL ERROR:",
              movie.id,
              error
            );

            return null;

          }

        }
      )

    );


  // =======================================================
  // 有効な映画だけ
  // =======================================================

  const validMovieDetails =
    movieDetails.filter(
      function(movie) {

        return (
          movie &&
          movie.id &&
          movie.title
        );

      }
    );


  // =======================================================
  // コレクション候補
  // =======================================================

  const collectionMap =
    new Map();


  validMovieDetails.forEach(
    function(movie) {

      const collection =
        movie.belongs_to_collection;


      if (
        !collection ||
        !collection.id
      ) {

        return;

      }


      collectionMap.set(
        String(collection.id),
        {
          id:
            collection.id,

          name:
            collection.name ||
            "",

          movie:
            movie

        }
      );

    }
  );


  // =======================================================
  // コレクションの関連性を判定
  // =======================================================

  const scoredCollections =
    Array.from(
      collectionMap.values()
    )
      .map(
        function(collection) {

          const collectionName =
            normalizeTitle(
              collection.name ||
              ""
            );


          let score = 0;


          // =================================================
          // コレクション名完全一致
          // =================================================

          if (
            collectionName ===
            normalizedTvTitle
          ) {

            score += 1000;

          }


          if (
            normalizedOriginalTitle &&
            collectionName ===
            normalizedOriginalTitle
          ) {

            score += 900;

          }


          // =================================================
          // TVタイトルを含む
          // =================================================

          if (
            normalizedTvTitle &&
            collectionName.includes(
              normalizedTvTitle
            )
          ) {

            score += 800;

          }


          // =================================================
          // TVタイトル側に
          // コレクション名が含まれる
          // =================================================

          if (
            collectionName &&
            normalizedTvTitle.includes(
              collectionName
            )
          ) {

            score += 700;

          }


          // =================================================
          // 原題との関連
          // =================================================

          if (
            normalizedOriginalTitle &&
            collectionName.includes(
              normalizedOriginalTitle
            )
          ) {

            score += 600;

          }


          if (
            collectionName &&
            normalizedOriginalTitle.includes(
              collectionName
            )
          ) {

            score += 500;

          }


          // =================================================
          // コレクションに属する映画数を
          // 後で取得できる可能性があるため
          // 候補として保持
          // =================================================

          return {

            collection:
              collection,

            score:
              score

          };

        }
      );


  // =======================================================
  // 関連性順
  // =======================================================

  scoredCollections.sort(
    function(a, b) {

      return (
        b.score -
        a.score
      );

    }
  );


  // =======================================================
  // 最も関連性の高いコレクション
  // =======================================================

  const best =
    scoredCollections.length
      ? scoredCollections[0]
      : null;


  // =======================================================
  // 関連コレクションが見つからない
  // =======================================================

  if (
    !best ||
    best.score <= 0
  ) {

    return [];

  }


  // =======================================================
  // コレクション取得
  // =======================================================

  const collection =
    await getCollection(
      best.collection.id,
      apiKey
    );


  if (
    !collection ||
    !Array.isArray(
      collection.movies
    )
  ) {

    return [];

  }


  // =======================================================
  // 劇場版だけを取得
  //
  // TV作品自身や不正なデータを除外
  // =======================================================

  const relatedMovies =
    collection.movies
      .filter(
        function(movie) {

          if (
            !movie ||
            !movie.id ||
            !movie.title
          ) {

            return false;

          }


          // TV作品IDと同じものは除外
          if (
            String(movie.id) ===
            String(tv.id)
          ) {

            return false;

          }


          return true;

        }
      );


  // =======================================================
  // 公開日順
  //
  // 古い劇場版
  // ↓
  // 新しい劇場版
  //
  // これで「劇場版シリーズ」として
  // 見やすくする
  // =======================================================

  relatedMovies.sort(
    function(a, b) {

      const dateA =
        a.release_date ||
        "9999-99-99";


      const dateB =
        b.release_date ||
        "9999-99-99";


      return (
        dateA.localeCompare(
          dateB
        )
      );

    }
  );


  // =======================================================
  // サイト用データ
  // =======================================================

  return relatedMovies.map(
    function(movie) {

      return {

        id:
          movie.id,

        title:
          movie.title ||
          "",

        original_title:
          movie.original_title ||
          "",

        release_date:
          movie.release_date ||
          "",

        poster_path:
          movie.poster_path ||
          null,

        media_type:
          "劇場版",

        content_type:
          "anime_movie"

      };

    }
  );

}

// =========================================================
// TV関連シリーズ取得
//
// ・TMDB recommendations
// ・TMDB similar
//
// TV作品同士の関連作品を取得して
// 「関連シリーズ」として表示する
// =========================================================

async function getTvRelatedSeries(
  tvId,
  apiKey
) {

  let recommendations = [];
  let similar = [];


  // =======================================================
  // TMDB recommendations
  // =======================================================

  try {

    const recommendationsUrl =
      "https://api.themoviedb.org/3/tv/" +
      encodeURIComponent(tvId) +
      "/recommendations" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&page=1";


    const data =
      await fetchJson(
        recommendationsUrl
      );


    if (
      data &&
      Array.isArray(
        data.results
      )
    ) {

      recommendations =
        data.results;

    }

  } catch (error) {

    console.error(
      "TV RECOMMENDATIONS ERROR:",
      error
    );

  }


  // =======================================================
  // TMDB similar
  // =======================================================

  try {

    const similarUrl =
      "https://api.themoviedb.org/3/tv/" +
      encodeURIComponent(tvId) +
      "/similar" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&page=1";


    const data =
      await fetchJson(
        similarUrl
      );


    if (
      data &&
      Array.isArray(
        data.results
      )
    ) {

      similar =
        data.results;

    }

  } catch (error) {

    console.error(
      "TV SIMILAR ERROR:",
      error
    );

  }


  // =======================================================
  // 結合
  // =======================================================

  const combined =
    []
      .concat(
        recommendations
      )
      .concat(
        similar
      );


  // =======================================================
  // 重複削除
  // =======================================================

  const seriesMap =
    new Map();


  combined.forEach(
    function(item) {

      if (
        !item ||
        !item.id
      ) {

        return;

      }


      // 元作品自身を除外

      if (
        String(item.id) ===
        String(tvId)
      ) {

        return;

      }


      // TV作品だけを対象

      if (
        !(
          item.name ||
          item.original_name
        )
      ) {

        return;

      }


      seriesMap.set(
        String(item.id),
        item
      );

    }
  );


  // =======================================================
  // 最大10作品
  // =======================================================

  const series =
    Array.from(
      seriesMap.values()
    )
      .slice(0, 10);


  // =======================================================
  // サイト用データに整形
  // =======================================================

  return series.map(
    function(item) {

      return {

        id:
          item.id,

        title:
          item.name ||
          item.original_name ||
          "",

        original_title:
          item.original_name ||
          "",

        release_date:
          item.first_air_date ||
          "",

        poster_path:
          item.poster_path ||
          null,

        media_type:
          "TVシリーズ",

        content_type:
          "tv"

      };

    }
  );

}

// =========================================================
// TV作品 おすすめ取得
//
// ・TMDB recommendations
// ・TMDB similar
//
// ドラマ・TVアニメ共通
// =========================================================

async function getTvRecommendations(
  tvId,
  apiKey
) {

  let recommendations = [];
  let similar = [];


  // =======================================================
  // TMDB recommendations
  // =======================================================

  try {

    const recommendationsUrl =
      "https://api.themoviedb.org/3/tv/" +
      encodeURIComponent(tvId) +
      "/recommendations" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&page=1";


    const data =
      await fetchJson(
        recommendationsUrl
      );


    if (
      data &&
      Array.isArray(
        data.results
      )
    ) {

      recommendations =
        data.results;

    }

  } catch (error) {

    console.error(
      "TV RECOMMENDATIONS ERROR:",
      error
    );

  }


  // =======================================================
  // TMDB similar
  //
  // recommendationsだけでは少ない作品用
  // =======================================================

  try {

    const similarUrl =
      "https://api.themoviedb.org/3/tv/" +
      encodeURIComponent(tvId) +
      "/similar" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&page=1";


    const data =
      await fetchJson(
        similarUrl
      );


    if (
      data &&
      Array.isArray(
        data.results
      )
    ) {

      similar =
        data.results;

    }

  } catch (error) {

    console.error(
      "TV SIMILAR ERROR:",
      error
    );

  }


  // =======================================================
  // 結合
  // =======================================================

  const combined =
    []
      .concat(
        recommendations
      )
      .concat(
        similar
      );


  // =======================================================
  // 重複削除
  // =======================================================

  const recommendationMap =
    new Map();


  combined.forEach(
    function(item) {

      if (
        !item ||
        !item.id
      ) {

        return;

      }


      // 元作品自身を除外

      if (
        String(item.id) ===
        String(tvId)
      ) {

        return;

      }


      // TV作品だけを対象

      if (
        !(
          item.name ||
          item.original_name
        )
      ) {

        return;

      }


      recommendationMap.set(
        String(item.id),
        item
      );

    }
  );


  // =======================================================
  // 最大10作品
  // =======================================================

  return Array.from(
    recommendationMap.values()
  )
    .slice(0, 10)
    .map(
      function(item) {

        return {

          id:
            item.id,

          title:
            item.name ||
            item.original_name ||
            "",

          original_title:
            item.original_name ||
            "",

          release_date:
            item.first_air_date ||
            "",

          poster_path:
            item.poster_path ||
            null,

          media_type:
            "TVシリーズ",

          content_type:
            "tv"

        };

      }
    );

}

// =========================================================
// TV作品ステータス表示
//
// TMDBのステータスを
// サイト用の日本語に変換
//
// 「Ended」を「完結」とせず
// 「TVシリーズ終了」と表示する
// =========================================================

function formatTvStatus(tv) {

  if (!tv) {
    return "";
  }


  const status =
    String(
      tv.status ||
      ""
    ).trim();


  switch (status) {

    case "Returning Series":

      return "放送中";


    case "In Production":

      return "制作中";


    case "Planned":

      return "放送予定";


    case "Pilot":

      return "パイロット";


    case "Canceled":

      return "打ち切り";


    case "Ended":

      return "TVシリーズ終了";


    default:

      return status;

  }

}

// =========================================================
// TVシーズン詳細取得
//
// ・シーズン情報
// ・エピソード一覧
// ・話数
// ・放送日
// ・エピソード概要
//
// 配信情報は作品全体の配信情報を取得する
// =========================================================

async function getTvSeason(
  tvId,
  seasonNumber,
  apiKey
) {

  // =======================================================
  // シーズン情報
  // =======================================================

  const seasonUrl =
    "https://api.themoviedb.org/3/tv/" +
    encodeURIComponent(tvId) +
    "/season/" +
    encodeURIComponent(seasonNumber) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP";


  const season =
    await fetchJson(
      seasonUrl
    );


  // =======================================================
  // TV作品本体の情報も取得
  //
  // 配信サービスを表示するため
  // =======================================================

  let tv = null;

  let providersData = {};

  try {

    const tvUrl =
      "https://api.themoviedb.org/3/tv/" +
      encodeURIComponent(tvId) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&append_to_response=watch/providers";


    tv =
      await fetchJson(
        tvUrl
      );


    if (
      tv &&
      tv["watch/providers"] &&
      tv["watch/providers"].results &&
      tv["watch/providers"].results.JP
    ) {

      providersData =
        tv["watch/providers"].results.JP;

    }

  } catch (error) {

    console.error(
      "TV SEASON PROVIDER ERROR:",
      error
    );

  }


  // =======================================================
  // 配信情報
  // =======================================================

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
  // エピソード
  // =======================================================

  const episodes =
    Array.isArray(
      season.episodes
    )
      ? season.episodes
          .map(
            function(episode) {

              return {

                episode_number:
                  Number(
                    episode.episode_number || 0
                  ),

                name:
                  episode.name ||
                  (
                    "第" +
                    episode.episode_number +
                    "話"
                  ),

                air_date:
                  episode.air_date ||
                  "",

                overview:
                  episode.overview ||
                  "",

                runtime:
                  Number(
                    episode.runtime || 0
                  ),

                still_path:
                  episode.still_path ||
                  null

              };

            }
          )
          .filter(
            function(episode) {

              return (
                episode &&
                episode.episode_number > 0
              );

            }
          )
      : [];


  // =======================================================
  // 作品タイトル
  // =======================================================

  const title =
    tv
      ? (
          tv.name ||
          tv.original_name ||
          ""
        )
      : "";


  // =======================================================
  // 完成データ
  // =======================================================

  return {

    id:
      Number(tvId),


    title:
      title,


    season_number:
      Number(
        season.season_number ||
        seasonNumber
      ),


    season_name:
      season.name ||
      (
        "シーズン" +
        seasonNumber
      ),


    poster_path:
      season.poster_path ||
      null,


    air_date:
      season.air_date ||
      "",


    episode_count:
      episodes.length,


    episodes:
      episodes,


    // ===================================================
    // 配信情報
    // ===================================================

    streaming:
      streaming,


    rental:
      rental,


    purchase:
      purchase

  };

}
