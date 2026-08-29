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
    // 作品詳細
    // =====================================================

    if (id) {

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
    "&page=1" +
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

      allMovies =
        allMovies.concat(
          data.results
        );

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

    return (
      movie &&
      movie.id &&
      movie.title
    );

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
// 最大10件
// =====================================================

movies =
  movies.slice(0, 10);


// =====================================================
// 結果整形
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
  // TMDBの「似ている作品」を取得
  // =======================================================

  let recommendations = [];


  try {

    const recommendationUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "/similar" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&page=1";


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

      recommendations =
        recommendationData.results
          .filter(function(item) {

            return (
              item &&
              item.id &&
              item.title &&
              String(item.id) !==
                String(movie.id)
            );

          })
          .slice(0, 10)
          .map(function(item) {

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

          });

    }

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
  // 最大3作品
  // =======================================================

  movies =
    movies.slice(
      0,
      3
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
