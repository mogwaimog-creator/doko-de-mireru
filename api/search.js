// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版・完全置換用
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
    // 配信サービスを安全に整理
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
      findProviderByKeyword(
        "netflix",
        streamingData,
        rentalData,
        purchaseData
      );


    let netflixUrl = null;


    if (netflix) {

      /*
       * TMDBが返すリンクを優先。
       *
       * ただしTMDBのprovider_urlは
       * Netflixホームになる場合があるため、
       * 作品IDが取れた場合のみ作品URLを作る。
       */

      netflixUrl =
        findNetflixDirectUrl(
          netflix
        );


      if (!netflixUrl) {

        netflixUrl =
          createNetflixSearchUrl(
            movie.title ||
            movie.original_title ||
            ""
          );

      }

    }


    // =====================================================
    // Amazon
    // =====================================================

    const amazon =
      findProviderByKeyword(
        "amazon",
        streamingData,
        rentalData,
        purchaseData
      );


    let amazonUrl = null;


    if (amazon) {

      /*
       * TMDBから直接作品URLが取得できる場合は
       * それを優先。
       */

      amazonUrl =
        findAmazonDirectUrl(
          amazon
        );


      /*
       * 取得できなければAmazon Video検索
       */

      if (!amazonUrl) {

        amazonUrl =
          createAmazonSearchUrl(
            movie.title ||
            movie.original_title ||
            ""
          );

      }

    }


    // =====================================================
    // その他サービス
    // =====================================================

    const unext =
      findProviderByKeyword(
        "unext",
        streamingData,
        rentalData,
        purchaseData
      );


    const hulu =
      findProviderByKeyword(
        "hulu",
        streamingData,
        rentalData,
        purchaseData
      );


    const disney =
      findProviderByKeyword(
        "disney",
        streamingData,
        rentalData,
        purchaseData
      );


    const apple =
      findProviderByKeyword(
        "apple",
        streamingData,
        rentalData,
        purchaseData
      );


    // =====================================================
    // TMDBリンク
    // =====================================================

    const tmdbLink =
      providers.link ||
      (
        "https://www.themoviedb.org/movie/" +
        movie.id
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
        netflixUrl
          ? extractNetflixTitleId(
              netflixUrl
            )
          : null,

      netflix_id:
        netflixUrl
          ? extractNetflixTitleId(
              netflixUrl
            )
          : null,

      amazon:
        amazon
          ? {
              url:
                amazonUrl
            }
          : null,

      amazon_url:
        amazonUrl,

      unext_url:
        getProviderUrl(unext),

      hulu_url:
        getProviderUrl(hulu),

      disney_url:
        getProviderUrl(disney),

      apple_tv_url:
        getProviderUrl(apple),

      series:
        series,

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
// 配信サービスを正規化
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
// キーワードで配信サービス検索
// =========================================================

function findProviderByKeyword(
  keyword,
  streaming,
  rental,
  purchase
) {

  const all = []
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
      name.includes(
        String(keyword).toLowerCase()
      )
    ) {

      return provider;

    }

  }


  return null;

}


// =========================================================
// Netflix直接URL
// =========================================================

function findNetflixDirectUrl(
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


    const id =
      extractNetflixTitleId(
        url
      );


    if (id) {

      return (
        "https://www.netflix.com/jp/title/" +
        encodeURIComponent(id)
      );

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

    return (
      "https://www.netflix.com/jp/"
    );

  }


  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(clean)
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


    /*
     * Amazon Videoの作品ページ
     *
     * /gp/video/detail/XXXXXXXXXX
     */

    const match =
      url.match(
        /amazon\.co\.jp\/gp\/video\/detail\/([A-Z0-9]+)/i
      );


    if (match) {

      return (
        "https://www.amazon.co.jp/gp/video/detail/" +
        match[1]
      );

    }


    /*
     * Amazonの動画URLが別形式の場合
     */

    if (
      /amazon\.co\.jp\/.*video/i.test(
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

function getProviderUrl(
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

    if (
      typeof urls[i] === "string" &&
      /^https?:\/\//i.test(
        urls[i]
      )
    ) {

      return urls[i];

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
