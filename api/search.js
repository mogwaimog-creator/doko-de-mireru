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
// ※ TMDBのWatch Providersには
//   サービス別の作品URLが常に入っているわけではないため
//   取得できない場合は各公式サービスの検索ページへ移動
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

  res.setHeader(
    "Cache-Control",
    "no-store"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }


  // =======================================================
  // API KEY
  // =======================================================

  const apiKey =
    process.env.TMDB_API_KEY;

  if (!apiKey) {

    return res.status(500).json({
      error: "TMDB_API_KEY が設定されていません。"
    });

  }


  try {

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
    // 作品詳細
    // =====================================================

    if (id) {

      return await getMovieDetail(
        id,
        apiKey,
        res
      );

    }


    // =====================================================
    // 映画検索
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error: "映画名を入力してください。"
      });

    }


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

      const errorText =
        await response.text();

      console.error(
        "TMDB SEARCH ERROR:",
        response.status,
        errorText
      );

      return res.status(500).json({
        error:
          "TMDB映画検索に失敗しました。",
        status:
          response.status
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
    // タイトル完全一致を優先
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


      const aDate =
        a.release_date ||
        "9999-99-99";

      const bDate =
        b.release_date ||
        "9999-99-99";


      return String(aDate)
        .localeCompare(
          String(bDate)
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


    // =====================================================
    // index.html が期待している形式
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
  apiKey,
  res
) {

  try {

    const detailUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&append_to_response=credits,watch/providers";


    console.log(
      "TMDB DETAIL:",
      movieId
    );


    const response =
      await fetch(detailUrl);


    if (!response.ok) {

      const errorText =
        await response.text();

      console.error(
        "TMDB DETAIL ERROR:",
        response.status,
        errorText
      );

      return res.status(404).json({

        error:
          "作品情報を取得できませんでした。",

        status:
          response.status

      });

    }


    const movie =
      await response.json();


    if (
      !movie ||
      !movie.id
    ) {

      return res.status(404).json({

        error:
          "作品データがありません。"

      });

    }


    // =====================================================
    // 日本の配信情報
    // =====================================================

    const watchProviders =
      movie["watch/providers"];


    const providerResults =
      watchProviders &&
      watchProviders.results
        ? watchProviders.results
        : {};


    const providers =
      providerResults.JP || {};


    // =====================================================
    // 配信種類
    // =====================================================

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
    // 正規化
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
    // 作品タイトル
    // =====================================================

    const title =
      movie.title ||
      movie.original_title ||
      "";


    // =====================================================
    // サービス判定
    // =====================================================

    const netflix =
      findProvider(
        "netflix",
        streamingData,
        rentalData,
        purchaseData
      );


    const amazon =
      findProvider(
        "amazon",
        streamingData,
        rentalData,
        purchaseData
      );


    const unext =
      findProvider(
        "unext",
        streamingData,
        rentalData,
        purchaseData
      );


    const hulu =
      findProvider(
        "hulu",
        streamingData,
        rentalData,
        purchaseData
      );


    const disney =
      findProvider(
        "disney",
        streamingData,
        rentalData,
        purchaseData
      );


    const apple =
      findProvider(
        "apple",
        streamingData,
        rentalData,
        purchaseData
      );


    // =====================================================
    // サービスURL
    // =====================================================

    const netflixUrl =
      buildNetflixUrl(
        netflix,
        title
      );


    const amazonUrl =
      buildAmazonUrl(
        amazon,
        title
      );


    const unextUrl =
      buildUnextUrl(
        unext,
        title
      );


    const huluUrl =
      buildHuluUrl(
        hulu,
        title
      );


    const disneyUrl =
      buildDisneyUrl(
        disney,
        title
      );


    const appleUrl =
      buildAppleUrl(
        apple,
        title
      );


    // =====================================================
    // TMDB
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
        title,

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
              provider_name:
                netflix.provider_name,

              url:
                netflixUrl
            }
          : null,

      netflix_url:
        netflixUrl,

      netflix_title_id:
        extractNetflixTitleId(
          netflixUrl
        ),

      netflix_id:
        extractNetflixTitleId(
          netflixUrl
        ),


      // ===================================================
      // Amazon
      // ===================================================

      amazon:
        amazon
          ? {
              provider_name:
                amazon.provider_name,

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

        display_priority:
          provider.display_priority ||
          null

      };

    });

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

  const all = []
    .concat(streaming || [])
    .concat(rental || [])
    .concat(purchase || []);


  const key =
    String(
      keyword || ""
    ).toLowerCase();


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


    if (
      isSameProvider(
        key,
        name
      )
    ) {

      return provider;

    }

  }


  return null;

}


// =========================================================
// サービス名判定
// =========================================================

function isSameProvider(
  keyword,
  name
) {

  if (
    keyword === "netflix"
  ) {

    return name.includes("netflix");

  }


  if (
    keyword === "amazon"
  ) {

    return (
      name.includes("amazon") ||
      name.includes("prime video")
    );

  }


  if (
    keyword === "unext"
  ) {

    return (
      name.includes("u-next") ||
      name.includes("unext")
    );

  }


  if (
    keyword === "hulu"
  ) {

    return name.includes("hulu");

  }


  if (
    keyword === "disney"
  ) {

    return name.includes("disney");

  }


  if (
    keyword === "apple"
  ) {

    return (
      name.includes("apple") ||
      name.includes("itunes")
    );

  }


  return false;

}


// =========================================================
// Netflix URL
// =========================================================

function buildNetflixUrl(
  provider,
  title
) {

  if (!provider) {
    return null;
  }


  // provider自体から直接URLが来た場合
  if (
    provider.url &&
    extractNetflixTitleId(
      provider.url
    )
  ) {

    return (
      "https://www.netflix.com/jp/title/" +
      extractNetflixTitleId(
        provider.url
      )
    );

  }


  // 検索ページ
  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(
      title
    )
  );

}


// =========================================================
// Amazon URL
// =========================================================

function buildAmazonUrl(
  provider,
  title
) {

  if (!provider) {
    return null;
  }


  return (
    "https://www.amazon.co.jp/s?k=" +
    encodeURIComponent(
      title
    ) +
    "&i=instant-video"
  );

}


// =========================================================
// U-NEXT URL
// =========================================================

function buildUnextUrl(
  provider,
  title
) {

  if (!provider) {
    return null;
  }


  return (
    "https://video.unext.jp/search?query=" +
    encodeURIComponent(
      title
    )
  );

}


// =========================================================
// Hulu URL
// =========================================================

function buildHuluUrl(
  provider,
  title
) {

  if (!provider) {
    return null;
  }


  return (
    "https://www.hulu.jp/search?q=" +
    encodeURIComponent(
      title
    )
  );

}


// =========================================================
// Disney+ URL
// =========================================================

function buildDisneyUrl(
  provider,
  title
) {

  if (!provider) {
    return null;
  }


  return (
    "https://www.disneyplus.com/ja-jp/search?q=" +
    encodeURIComponent(
      title
    )
  );

}


// =========================================================
// Apple TV URL
// =========================================================

function buildAppleUrl(
  provider,
  title
) {

  if (!provider) {
    return null;
  }


  return (
    "https://tv.apple.com/jp/search?term=" +
    encodeURIComponent(
      title
    )
  );

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

    const person =
      crew[i];


    if (
      person &&
      person.job === "Director"
    ) {

      return {

        id:
          person.id || null,

        name:
          person.name || ""

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
      encodeURIComponent(
        collectionId
      ) +
      "?api_key=" +
      encodeURIComponent(
        apiKey
      ) +
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
