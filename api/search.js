```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// 配信リンク改善版
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
// 重要:
// TMDB Watch Providers は完全な配信作品URLを
// 必ず返す仕様ではありません。
// そのため、存在しない作品URLを推測して
// 別作品へ飛ばすことはしません。
// =========================================================

module.exports = async function handler(req, res) {

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
    // 検索文字がない
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error:
          "映画名を入力してください。"
      });

    }


    // =====================================================
    // 映画検索
    // =====================================================

    const searchUrl =
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
      await fetch(searchUrl);


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
    // 完全一致を先頭へ
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


      if (aExact !== bExact) {
        return aExact - bExact;
      }


      return String(
        a.release_date || "9999-99-99"
      ).localeCompare(
        String(
          b.release_date || "9999-99-99"
        )
      );

    });


    // =====================================================
    // 最大10件
    // =====================================================

    movies =
      movies.slice(0, 10);


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
  apiKey,
  res
) {

  try {

    // =====================================================
    // 映画情報
    // =====================================================

    const detailUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&append_to_response=credits,watch/providers";


    const response =
      await fetch(detailUrl);


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
    // 監督
    // =====================================================

    const director =
      getDirector(movie);


    // =====================================================
    // 出演者
    // =====================================================

    const cast =
      getCast(movie);


    // =====================================================
    // シリーズ
    // =====================================================

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


    // =====================================================
    // 配信情報を整理
    // =====================================================

    const streamingData =
      normalizeProviders(
        streaming
      );


    const rentalData =
      normalizeProviders(
        rental
      );


    const purchaseData =
      normalizeProviders(
        purchase
      );


    // =====================================================
    // 各サービスを取得
    // =====================================================

    const netflix =
      findProviderByService(
        "netflix",
        streamingData,
        rentalData,
        purchaseData
      );


    const amazon =
      findProviderByService(
        "amazon",
        streamingData,
        rentalData,
        purchaseData
      );


    const unext =
      findProviderByService(
        "unext",
        streamingData,
        rentalData,
        purchaseData
      );


    const hulu =
      findProviderByService(
        "hulu",
        streamingData,
        rentalData,
        purchaseData
      );


    const disney =
      findProviderByService(
        "disney",
        streamingData,
        rentalData,
        purchaseData
      );


    const apple =
      findProviderByService(
        "apple",
        streamingData,
        rentalData,
        purchaseData
      );


    // =====================================================
    // Netflix URL
    // =====================================================

    const netflixUrl =
      getNetflixUrl(
        netflix,
        movie
      );


    const netflixId =
      extractNetflixTitleId(
        netflixUrl
      );


    // =====================================================
    // Amazon URL
    // =====================================================

    const amazonUrl =
      getAmazonUrl(
        amazon,
        movie
      );


    // =====================================================
    // その他URL
    // =====================================================

    const unextUrl =
      getServiceUrl(
        unext,
        "unext",
        movie
      );


    const huluUrl =
      getServiceUrl(
        hulu,
        "hulu",
        movie
      );


    const disneyUrl =
      getServiceUrl(
        disney,
        "disney",
        movie
      );


    const appleUrl =
      getServiceUrl(
        apple,
        "apple",
        movie
      );


    // =====================================================
    // TMDBリンク
    // =====================================================

    const tmdbLink =
      providers.link ||
      (
        "https://www.themoviedb.org/movie/" +
        movie.id +
        "/watch?locale=JP"
      );


    // =====================================================
    // 最終結果
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

      original_language:
        movie.original_language || "",

      director:
        director,

      cast:
        cast,

      streaming:
        streamingData,

      rental:
        rentalData,

      purchase:
        purchaseData,


      // ===================================================
      // Netflix
      // ===================================================

      netflix:
        netflix
          ? {
              provider_id:
                netflix.provider_id,

              provider_name:
                netflix.provider_name,

              url:
                netflixUrl
            }
          : null,

      netflix_url:
        netflixUrl,

      netflix_title_id:
        netflixId,

      netflix_id:
        netflixId,


      // ===================================================
      // Amazon
      // ===================================================

      amazon:
        amazon
          ? {
              provider_id:
                amazon.provider_id,

              provider_name:
                amazon.provider_name,

              url:
                amazonUrl
            }
          : null,

      amazon_url:
        amazonUrl,


      // ===================================================
      // その他
      // ===================================================

      unext_url:
        unextUrl,

      hulu_url:
        huluUrl,

      disney_url:
        disneyUrl,

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
        tmdbLink

    };


    return res.status(200).json(
      result
    );


  } catch (error) {

    console.error(
      "DETAIL ERROR:",
      error
    );

    return res.status(500).json({
      error:
        error &&
        error.message
          ? error.message
          : "作品詳細の取得に失敗しました。"
    });

  }

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
        (
          provider.provider_name ||
          provider.name
        )
      );

    })
    .map(function(provider) {

      return {

        provider_id:
          provider.provider_id || null,

        provider_name:
          provider.provider_name ||
          provider.name ||
          "",

        logo_path:
          provider.logo_path ||
          null,

        provider_url:
          provider.provider_url ||
          null,

        url:
          provider.url ||
          null,

        link:
          provider.link ||
          null,

        watch_link:
          provider.watch_link ||
          null

      };

    });

}


// =========================================================
// サービス検索
// =========================================================

function findProviderByService(
  service,
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


  // =======================================================
  // TMDB Provider ID
  //
  // Netflix = 8
  // Amazon Video = 10
  // Apple TV = 2
  // U-NEXT = 84
  // Hulu = 15
  // Disney Plus = 337
  // =======================================================

  const ids = {

    netflix: [8],

    amazon: [
      9,
      10,
      119
    ],

    unext: [84],

    hulu: [15],

    disney: [337],

    apple: [2]

  };


  const targetIds =
    ids[service] || [];


  // =======================================================
  // ID優先
  // =======================================================

  for (
    let i = 0;
    i < all.length;
    i++
  ) {

    const provider =
      all[i];


    if (
      provider &&
      targetIds.includes(
        Number(provider.provider_id)
      )
    ) {

      return provider;

    }

  }


  // =======================================================
  // 名前判定
  // =======================================================

  const keywords = {

    netflix: [
      "netflix"
    ],

    amazon: [
      "amazon",
      "prime video"
    ],

    unext: [
      "u-next",
      "unext"
    ],

    hulu: [
      "hulu"
    ],

    disney: [
      "disney"
    ],

    apple: [
      "apple tv",
      "apple tv store"
    ]

  };


  const targetKeywords =
    keywords[service] || [];


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
      ).toLowerCase();


    for (
      let j = 0;
      j < targetKeywords.length;
      j++
    ) {

      if (
        name.includes(
          targetKeywords[j]
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

function getNetflixUrl(
  provider,
  movie
) {

  if (!provider) {
    return null;
  }


  // =======================================================
  // 既存のNetflix作品URLを確認
  // =======================================================

  const directId =
    getNetflixIdFromProvider(
      provider
    );


  if (directId) {

    return (
      "https://www.netflix.com/jp/title/" +
      encodeURIComponent(
        directId
      )
    );

  }


  // =======================================================
  // Netflix作品URLが取得できない場合
  //
  // 勝手にIDを作らない
  // =======================================================

  return createNetflixSearchUrl(
    movie.title ||
    movie.original_title ||
    ""
  );

}


// =========================================================
// Netflix ID取得
// =========================================================

function getNetflixIdFromProvider(
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

    const id =
      extractNetflixTitleId(
        urls[i]
      );


    if (id) {

      return id;

    }

  }


  return null;

}


// =========================================================
// Netflix ID抽出
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

    /netflix\.com\/(?:jp\/)?title\/(\d+)/i,

    /netflix\.com\/(?:jp\/)?watch\/(\d+)/i,

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
// Amazon URL
// =========================================================

function getAmazonUrl(
  provider,
  movie
) {

  if (!provider) {
    return null;
  }


  // =======================================================
  // Amazon作品URLが既に存在する場合
  // =======================================================

  const directUrl =
    findAmazonDirectUrl(
      provider
    );


  if (directUrl) {

    return directUrl;

  }


  // =======================================================
  // Amazon Video検索
  // =======================================================

  return createAmazonSearchUrl(
    movie.title ||
    movie.original_title ||
    ""
  );

}


// =========================================================
// Amazon直接URL
// =========================================================

function findAmazonDirectUrl(
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
      typeof url !== "string" ||
      !url
    ) {

      continue;

    }


    // Amazon Video detail
    if (
      /amazon\.co\.jp\/gp\/video\/detail\//i.test(
        url
      )
    ) {

      return url;

    }


    // Amazon video detail alternate
    if (
      /amazon\.co\.jp\/.*\/video\/detail\//i.test(
        url
      )
    ) {

      return url;

    }

  }


  return null;

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
// その他サービスURL
// =========================================================

function getServiceUrl(
  provider,
  service,
  movie
) {

  if (!provider) {
    return null;
  }


  // =======================================================
  // まず、本当にそのサービスのURLか確認
  // =======================================================

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
      typeof url !== "string" ||
      !/^https?:\/\//i.test(url)
    ) {

      continue;

    }


    if (
      isCorrectServiceUrl(
        url,
        service
      )
    ) {

      return url;

    }

  }


  // =======================================================
  // サービス側URLがない場合
  //
  // 無理にURLを作らない
  // =======================================================

  return createServiceSearchUrl(
    service,
    movie.title ||
    movie.original_title ||
    ""
  );

}


// =========================================================
// サービスURL判定
// =========================================================

function isCorrectServiceUrl(
  url,
  service
) {

  const value =
    String(url).toLowerCase();


  const domains = {

    unext: [
      "video.unext.jp",
      "unext.jp"
    ],

    hulu: [
      "hulu.jp"
    ],

    disney: [
      "disneyplus.com",
      "disney.co.jp"
    ],

    apple: [
      "tv.apple.com"
    ]

  };


  const target =
    domains[service] || [];


  for (
    let i = 0;
    i < target.length;
    i++
  ) {

    if (
      value.includes(
        target[i]
      )
    ) {

      return true;

    }

  }


  return false;

}


// =========================================================
// サービス検索URL
// =========================================================

function createServiceSearchUrl(
  service,
  title
) {

  const clean =
    String(
      title || ""
    ).trim();


  const encoded =
    encodeURIComponent(
      clean
    );


  switch(service){

    case "unext":

      return (
        "https://video.unext.jp/freeword/" +
        encoded
      );


    case "hulu":

      return (
        "https://www.hulu.jp/search?q=" +
        encoded
      );


    case "disney":

      return (
        "https://www.disneyplus.com/ja-jp/search/" +
        encoded
      );


    case "apple":

      return (
        "https://tv.apple.com/jp/search?term=" +
        encoded
      );


    default:

      return null;

  }

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


    const response =
      await fetch(url);


    if (!response.ok) {

      console.error(
        "COLLECTION ERROR:",
        response.status
      );

      return null;

    }


    const data =
      await response.json();


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

          const dateA =
            a.release_date ||
            "9999-99-99";

          const dateB =
            b.release_date ||
            "9999-99-99";


          return dateA.localeCompare(
            dateB
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
