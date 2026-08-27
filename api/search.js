// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版
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
// Vercel Serverless Function対応
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
    "GET, OPTIONS"
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

      console.error(
        "TMDB_API_KEY is missing"
      );

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
    // 詳細
    // =====================================================

    if (id) {

      return await getMovieDetail(
        id,
        apiKey,
        res
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
    // TMDB検索URL
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


    console.log(
      "TMDB SEARCH:",
      query
    );


    // =====================================================
    // TMDB検索
    // =====================================================

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
          (
            movie.title ||
            movie.original_title
          )
        );

      });


    // =====================================================
    // 完全一致優先
    // =====================================================

    const normalizedQuery =
      normalizeTitle(query);


    movies.sort(function(a, b) {

      const aTitle =
        normalizeTitle(
          a.title ||
          a.original_title ||
          ""
        );

      const bTitle =
        normalizeTitle(
          b.title ||
          b.original_title ||
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


      const dateA =
        a.release_date ||
        "9999-99-99";

      const dateB =
        b.release_date ||
        "9999-99-99";


      return String(dateA)
        .localeCompare(
          String(dateB)
        );

    });


    // =====================================================
    // 最大10件
    // =====================================================

    movies =
      movies.slice(0, 10);


    // =====================================================
    // index.html用データ
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
      "SEARCH FUNCTION ERROR:",
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
    // TMDB詳細
    // =====================================================

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
          "作品情報を取得できませんでした。"

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
          "作品情報が見つかりませんでした。"

      });

    }


    // =====================================================
    // 日本の配信情報
    // =====================================================

    const watch =
      movie["watch/providers"];


    const providerResults =
      watch &&
      watch.results
        ? watch.results
        : {};


    const jp =
      providerResults.JP || {};


    const streaming =
      Array.isArray(jp.flatrate)
        ? jp.flatrate
        : [];


    const rental =
      Array.isArray(jp.rent)
        ? jp.rent
        : [];


    const purchase =
      Array.isArray(jp.buy)
        ? jp.buy
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
    // 配信情報を正規化
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
    // Netflix
    // =====================================================

    const netflix =
      findProvider(
        "netflix",
        streamingData,
        rentalData,
        purchaseData
      );


    const netflixUrl =
      createNetflixUrl(
        movie,
        netflix,
        jp.link
      );


    // =====================================================
    // Amazon
    // =====================================================

    const amazon =
      findProvider(
        "amazon",
        streamingData,
        rentalData,
        purchaseData
      );


    const amazonUrl =
      createAmazonUrl(
        movie,
        amazon,
        jp.link
      );


    // =====================================================
    // U-NEXT
    // =====================================================

    const unext =
      findProvider(
        "unext",
        streamingData,
        rentalData,
        purchaseData
      );


    const unextUrl =
      createUnextUrl(
        movie,
        unext
      );


    // =====================================================
    // Hulu
    // =====================================================

    const hulu =
      findProvider(
        "hulu",
        streamingData,
        rentalData,
        purchaseData
      );


    const huluUrl =
      createHuluUrl(
        movie,
        hulu
      );


    // =====================================================
    // Disney+
    // =====================================================

    const disney =
      findProvider(
        "disney",
        streamingData,
        rentalData,
        purchaseData
      );


    const disneyUrl =
      createDisneyUrl(
        movie,
        disney
      );


    // =====================================================
    // Apple TV
    // =====================================================

    const apple =
      findProvider(
        "apple",
        streamingData,
        rentalData,
        purchaseData
      );


    const appleUrl =
      createAppleUrl(
        movie,
        apple
      );


    // =====================================================
    // TMDBリンク
    // =====================================================

    const tmdbLink =
      jp.link ||
      (
        "https://www.themoviedb.org/movie/" +
        movie.id +
        "?language=ja-JP"
      );


    // =====================================================
    // 結果
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
      "DETAIL FUNCTION ERROR:",
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
          provider.provider_id ||
          null,

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
// 配信サービス検索
// =========================================================

function findProvider(
  keyword,
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


  const target =
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
      name.includes(target)
    ) {

      return provider;

    }

  }


  return null;

}


// =========================================================
// URL取得
// =========================================================

function getValidUrl(
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
      typeof url === "string" &&
      /^https?:\/\//i.test(url)
    ) {

      return url;

    }

  }


  return null;

}


// =========================================================
// Netflix URL
// =========================================================

function createNetflixUrl(
  movie,
  provider,
  tmdbLink
) {

  // -------------------------------------------------------
  // 1. Netflix作品IDが既にある場合
  // -------------------------------------------------------

  const directId =
    extractNetflixTitleId(
      getValidUrl(provider)
    );


  if (directId) {

    return (
      "https://www.netflix.com/jp/title/" +
      directId
    );

  }


  // -------------------------------------------------------
  // 2. TMDBのリンクにNetflix URLが含まれている場合
  // -------------------------------------------------------

  const tmdbNetflixId =
    extractNetflixTitleId(
      tmdbLink
    );


  if (tmdbNetflixId) {

    return (
      "https://www.netflix.com/jp/title/" +
      tmdbNetflixId
    );

  }


  // -------------------------------------------------------
  // 3. Netflix検索
  //
  // TMDBだけでは作品IDを確実に取得できないため、
  // 最終的にはNetflix検索を使用。
  // -------------------------------------------------------

  const title =
    movie.title ||
    movie.original_title ||
    "";


  if (!title) {

    return "https://www.netflix.com/jp/";

  }


  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(title)
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

    /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i,

    /netflix\.com\/(?:[^/]+\/)?watch\/(\d+)/i,

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
// Amazon URL
// =========================================================

function createAmazonUrl(
  movie,
  provider,
  tmdbLink
) {

  // -------------------------------------------------------
  // Amazon直接URL
  // -------------------------------------------------------

  const direct =
    getValidUrl(provider);


  if (direct) {

    const amazonDetail =
      extractAmazonDetailUrl(
        direct
      );


    if (amazonDetail) {

      return amazonDetail;

    }

  }


  // -------------------------------------------------------
  // TMDBリンクにAmazon URLがある場合
  // -------------------------------------------------------

  const tmdbAmazon =
    extractAmazonDetailUrl(
      tmdbLink
    );


  if (tmdbAmazon) {

    return tmdbAmazon;

  }


  // -------------------------------------------------------
  // Amazon Video検索
  // -------------------------------------------------------

  const title =
    movie.title ||
    movie.original_title ||
    "";


  return (
    "https://www.amazon.co.jp/s?k=" +
    encodeURIComponent(title) +
    "&i=instant-video"
  );

}


// =========================================================
// Amazon作品URL抽出
// =========================================================

function extractAmazonDetailUrl(
  url
) {

  if (
    typeof url !== "string" ||
    !url
  ) {

    return null;

  }


  // Amazon Video detail
  const detail =
    url.match(
      /https?:\/\/(?:www\.)?amazon\.co\.jp\/gp\/video\/detail\/([A-Za-z0-9]+)/i
    );


  if (detail) {

    return (
      "https://www.amazon.co.jp/gp/video/detail/" +
      detail[1]
    );

  }


  // Amazon Prime Video
  if (
    /amazon\.co\.jp/i.test(url) &&
    /\/video\//i.test(url)
  ) {

    return url;

  }


  return null;

}


// =========================================================
// U-NEXT
// =========================================================

function createUnextUrl(
  movie,
  provider
) {

  const direct =
    getValidUrl(provider);


  if (
    direct &&
    /u-next/i.test(direct)
  ) {

    return direct;

  }


  const title =
    movie.title ||
    movie.original_title ||
    "";


  return (
    "https://video.unext.jp/search?query=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Hulu
// =========================================================

function createHuluUrl(
  movie,
  provider
) {

  const direct =
    getValidUrl(provider);


  if (
    direct &&
    /hulu/i.test(direct)
  ) {

    return direct;

  }


  const title =
    movie.title ||
    movie.original_title ||
    "";


  return (
    "https://www.hulu.jp/search?q=" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Disney+
// =========================================================

function createDisneyUrl(
  movie,
  provider
) {

  const direct =
    getValidUrl(provider);


  if (
    direct &&
    /disney/i.test(direct)
  ) {

    return direct;

  }


  const title =
    movie.title ||
    movie.original_title ||
    "";


  return (
    "https://www.disneyplus.com/ja-jp/search/" +
    encodeURIComponent(title)
  );

}


// =========================================================
// Apple TV
// =========================================================

function createAppleUrl(
  movie,
  provider
) {

  const direct =
    getValidUrl(provider);


  if (
    direct &&
    /apple/i.test(direct)
  ) {

    return direct;

  }


  const title =
    movie.title ||
    movie.original_title ||
    "";


  return (
    "https://tv.apple.com/jp/search?term=" +
    encodeURIComponent(title)
  );

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


          return String(dateA)
            .localeCompare(
              String(dateB)
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
      "COLLECTION FUNCTION ERROR:",
      error
    );

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

    const person =
      crew[i];


    if (
      person &&
      person.job === "Director"
    ) {

      return {

        id:
          person.id ||
          null,

        name:
          person.name ||
          ""

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
          person.id ||
          null,

        name:
          person.name ||
          ""

      };

    });

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
