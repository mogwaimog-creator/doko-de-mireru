// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版 + Netflix / Amazon リンク改善版
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

    const url =
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
      await fetch(url);


    if (!response.ok) {

      const text =
        await response.text();

      console.error(
        "TMDB search error:",
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
    // 最大10件
    // =====================================================

    movies =
      movies
        .filter(function(movie) {

          return (
            movie &&
            movie.id &&
            movie.title
          );

        })
        .slice(0, 10);


    // =====================================================
    // 結果
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
            Number(movie.vote_average || 0)

        };

      });


    return res.status(200).json({
      results: results
    });


  } catch (error) {

    console.error(
      "API ERROR:",
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

    const url =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&append_to_response=credits,watch/providers";


    const response =
      await fetch(url);


    if (!response.ok) {

      const text =
        await response.text();

      console.error(
        "TMDB detail error:",
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

    let director = null;


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

        director = {

          id:
            crew[i].id,

          name:
            crew[i].name || ""

        };

        break;

      }

    }


    // =====================================================
    // 出演者
    // =====================================================

    const cast =
      movie &&
      movie.credits &&
      Array.isArray(movie.credits.cast)
        ? movie.credits.cast
            .slice(0, 8)
            .map(function(person) {

              return {

                id:
                  person.id,

                name:
                  person.name || ""

              };

            })
        : [];


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
    // 基本結果
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
        Number(movie.vote_average || 0),

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
        streaming,

      rental:
        rental,

      purchase:
        purchase,

      series:
        series,

      link:
        providers.link ||
        (
          "https://www.themoviedb.org/movie/" +
          movie.id
        ),

      // Netflix
      netflix:
        null,

      netflix_url:
        null,

      netflix_title_id:
        null,

      netflix_id:
        null,

      // Amazon
      amazon:
        null,

      amazon_url:
        null

    };


    // =====================================================
    // Netflix
    // =====================================================

    const netflix =
      findProvider(
        "netflix",
        streaming,
        rental,
        purchase
      );


    if (netflix) {

      const netflixInfo =
        getNetflixLink(
          movie
        );


      result.netflix = {

        title_id:
          netflixInfo.titleId,

        url:
          netflixInfo.url

      };


      result.netflix_url =
        netflixInfo.url;


      result.netflix_title_id =
        netflixInfo.titleId;


      result.netflix_id =
        netflixInfo.titleId;

    }


    // =====================================================
    // Amazon Prime Video
    // =====================================================

    const amazon =
      findProvider(
        "amazon",
        streaming,
        rental,
        purchase
      );


    if (amazon) {

      const amazonInfo =
        getAmazonLink(
          movie
        );


      result.amazon = {

        url:
          amazonInfo.url

      };


      result.amazon_url =
        amazonInfo.url;

    }


    // =====================================================
    // その他サービス
    // =====================================================

    result.unext_url =
      findProviderUrl(
        "unext",
        streaming,
        rental,
        purchase
      );


    result.hulu_url =
      findProviderUrl(
        "hulu",
        streaming,
        rental,
        purchase
      );


    result.disney_url =
      findProviderUrl(
        "disney",
        streaming,
        rental,
        purchase
      );


    result.apple_tv_url =
      findProviderUrl(
        "apple",
        streaming,
        rental,
        purchase
      );


    // =====================================================
    // 完了
    // =====================================================

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
// Netflix / Amazon 手動確認済みリンク
//
// 正確な個別ページを確認できた作品だけ登録します。
// =========================================================

const VERIFIED_LINKS = {

  "怪盗グルーのミニオン超変身": {

    netflix: {
      id:
        "81776693",

      url:
        "https://www.netflix.com/jp/title/81776693"
    },

    amazon: {
      url:
        "https://www.primevideo.com/-/ja/detail/0KGWRU9CNGPAMPV8AERAH7RW0L"
    }

  }

};


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


// =========================================================
// 確認済みリンク取得
// =========================================================

function getVerifiedLink(
  movie,
  service
) {

  const title =
    normalizeTitle(
      movie &&
      (
        movie.title ||
        movie.original_title ||
        ""
      )
    );


  const keys =
    Object.keys(
      VERIFIED_LINKS
    );


  for (
    let i = 0;
    i < keys.length;
    i++
  ) {

    const key =
      keys[i];


    if (
      normalizeTitle(key) === title
    ) {

      return (
        VERIFIED_LINKS[key] &&
        VERIFIED_LINKS[key][service]
          ? VERIFIED_LINKS[key][service]
          : null
      );

    }

  }


  return null;

}


// =========================================================
// Netflixリンク
// =========================================================

function getNetflixLink(
  movie
) {

  // -----------------------------------------------------
  // まず手動確認済みURL
  // -----------------------------------------------------

  const verified =
    getVerifiedLink(
      movie,
      "netflix"
    );


  if (verified) {

    return {

      titleId:
        verified.id || null,

      url:
        verified.url

    };

  }


  // -----------------------------------------------------
  // TMDBなどにURL情報が存在する場合
  // -----------------------------------------------------

  const possibleUrls = [

    movie &&
    movie.netflix_url,

    movie &&
    movie.netflix_link,

    movie &&
    movie.netflix &&
    movie.netflix.url

  ];


  for (
    let i = 0;
    i < possibleUrls.length;
    i++
  ) {

    const info =
      normalizeNetflixUrl(
        possibleUrls[i]
      );


    if (info) {

      return info;

    }

  }


  // -----------------------------------------------------
  // 見つからない場合
  // -----------------------------------------------------
  //
  // 間違った作品へ飛ばすより、
  // Netflix公式検索を使用します。
  // -----------------------------------------------------

  const title =
    movie &&
    (
      movie.title ||
      movie.original_title ||
      ""
    );


  return {

    titleId:
      null,

    url:
      createNetflixSearchUrl(
        title
      )

  };

}


// =========================================================
// Netflix URL正規化
// =========================================================

function normalizeNetflixUrl(
  url
) {

  if (
    typeof url !== "string" ||
    !url.trim()
  ) {

    return null;

  }


  const clean =
    url.trim();


  const titleId =
    extractNetflixTitleId(
      clean
    );


  if (titleId) {

    return {

      titleId:
        titleId,

      url:
        "https://www.netflix.com/jp/title/" +
        encodeURIComponent(
          titleId
        )

    };

  }


  if (
    /^https?:\/\/(?:www\.)?netflix\.com\//i
      .test(clean)
  ) {

    return {

      titleId:
        null,

      url:
        clean

    };

  }


  return null;

}


// =========================================================
// Netflix ID取得
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
// Netflix検索URL
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
    encodeURIComponent(
      clean
    )
  );

}


// =========================================================
// Amazonリンク
// =========================================================

function getAmazonLink(
  movie
) {

  // -----------------------------------------------------
  // まず手動確認済みURL
  // -----------------------------------------------------

  const verified =
    getVerifiedLink(
      movie,
      "amazon"
    );


  if (verified) {

    return {

      url:
        verified.url

    };

  }


  // -----------------------------------------------------
  // movie内にAmazon URLがある場合
  // -----------------------------------------------------

  const possibleUrls = [

    movie &&
    movie.amazon_url,

    movie &&
    movie.amazon &&
    movie.amazon.url

  ];


  for (
    let i = 0;
    i < possibleUrls.length;
    i++
  ) {

    const url =
      normalizeAmazonUrl(
        possibleUrls[i]
      );


    if (url) {

      return {

        url:
          url

      };

    }

  }


  // -----------------------------------------------------
  // 最後はPrime Video検索
  // -----------------------------------------------------

  const title =
    movie &&
    (
      movie.title ||
      movie.original_title ||
      ""
    );


  return {

    url:
      createAmazonSearchUrl(
        title
      )

  };

}


// =========================================================
// Amazon URL正規化
// =========================================================

function normalizeAmazonUrl(
  url
) {

  if (
    typeof url !== "string" ||
    !url.trim()
  ) {

    return null;

  }


  const clean =
    url.trim();


  // Prime Video detail URL
  if (
    /^https?:\/\/(?:www\.)?primevideo\.com\//i
      .test(clean)
  ) {

    return clean;

  }


  // Amazon gp/video/detail
  const match =
    clean.match(
      /https?:\/\/(?:www\.)?amazon\.co\.jp\/gp\/video\/detail\/([A-Z0-9]+)/i
    );


  if (match) {

    return (
      "https://www.amazon.co.jp/gp/video/detail/" +
      match[1]
    );

  }


  return null;

}


// =========================================================
// Amazon検索URL
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
      "https://www.primevideo.com/"
    );

  }


  return (
    "https://www.amazon.co.jp/s?k=" +
    encodeURIComponent(
      clean
    ) +
    "&i=instant-video"
  );

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
        provider.provider_name ||
        provider.name ||
        ""
      ).toLowerCase();


    if (
      name.includes(keyword)
    ) {

      return provider;

    }

  }


  return null;

}


// =========================================================
// その他配信サービスURL
// =========================================================

function findProviderUrl(
  keyword,
  streaming,
  rental,
  purchase
) {

  const provider =
    findProvider(
      keyword,
      streaming,
      rental,
      purchase
    );


  if (!provider) {

    return null;

  }


  const urls = [

    provider.provider_url,

    provider.watch_link,

    provider.url,

    provider.link

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
// シリーズ取得
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
            a.release_date || "9999-99-99";

          const dateB =
            b.release_date || "9999-99-99";

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
      "Collection error:",
      error
    );

    return null;

  }

}
