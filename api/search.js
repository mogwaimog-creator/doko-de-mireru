```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// 安定版
//
// ・TMDB映画検索
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
// ・字幕 / 吹き替え情報の土台
// ・国情報
//
// CommonJS / Vercel対応
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
      typeof req.query.query === "string"
        ? req.query.query.trim()
        : "";


    const id =
      typeof req.query.id === "string"
        ? req.query.id.trim()
        : "";


    // =====================================================
    // IDあり → 詳細
    // =====================================================

    if (id) {

      return await getMovieDetail(
        id,
        apiKey,
        res
      );

    }


    // =====================================================
    // 検索文字なし
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

    return await searchMovies(
      query,
      apiKey,
      res
    );


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
// 映画検索
// =========================================================

async function searchMovies(
  query,
  apiKey,
  res
) {

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
      "TMDB SEARCH ERROR:",
      response.status,
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
  // 完全一致を優先
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

    results:
      results

  });

}


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
        "TMDB DETAIL ERROR:",
        response.status,
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
        Number(
          movie.vote_average || 0
        ),

      genres:
        Array.isArray(movie.genres)
          ? movie.genres
          : [],

      // ===================================================
      // 国
      // ===================================================

      production_countries:
        Array.isArray(
          movie.production_countries
        )
          ? movie.production_countries.map(
              function(country) {

                return {

                  iso_3166_1:
                    country.iso_3166_1 || "",

                  name:
                    country.name || ""

                };

              }
            )
          : [],


      origin_country:
        Array.isArray(movie.origin_country)
          ? movie.origin_country
          : [],


      original_language:
        movie.original_language || "",


      // ===================================================
      // 人物
      // ===================================================

      director:
        director,

      cast:
        cast,


      // ===================================================
      // 字幕・吹き替え
      //
      // TMDBだけでは日本配信サービスごとの
      // 字幕/吹き替えを完全には判定できないため、
      // 現時点では取得できる範囲のみ返す。
      // ===================================================

      language: {

        original_language:
          movie.original_language || null,

        subtitle:
          null,

        dubbing:
          null

      },


      // ===================================================
      // 配信
      // ===================================================

      streaming:
        enrichProviders(
          streaming,
          "streaming"
        ),


      rental:
        enrichProviders(
          rental,
          "rental"
        ),


      purchase:
        enrichProviders(
          purchase,
          "purchase"
        ),


      // ===================================================
      // サービスURL
      // ===================================================

      netflix_url:
        null,

      netflix_title_id:
        null,

      netflix_id:
        null,


      amazon_url:
        null,


      unext_url:
        null,

      hulu_url:
        null,

      disney_url:
        null,

      apple_tv_url:
        null,


      // ===================================================
      // シリーズ
      // ===================================================

      series:
        series,


      // ===================================================
      // TMDB / JustWatch
      // ===================================================

      link:
        providers.link ||
        (
          "https://www.themoviedb.org/movie/" +
          movie.id +
          "/watch"
        )

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

      const netflixId =
        extractNetflixIdFromProvider(
          netflix
        );


      if (netflixId) {

        result.netflix_title_id =
          netflixId;

        result.netflix_id =
          netflixId;

        result.netflix_url =
          "https://www.netflix.com/jp/title/" +
          encodeURIComponent(
            netflixId
          );

      } else {

        result.netflix_url =
          createNetflixSearchUrl(
            movie.title ||
            movie.original_title ||
            ""
          );

      }

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

      /*
       * Amazonの作品ページURLは
       * TMDBのwatch/providersから
       * 安定して取得できるとは限らないため、
       * ここではAmazon Video検索へ。
       *
       * 不正な作品ページに飛ばすより安全。
       */

      result.amazon_url =
        createAmazonSearchUrl(
          movie.title ||
          movie.original_title ||
          ""
        );

    }


    // =====================================================
    // U-NEXT
    // =====================================================

    const unext =
      findProvider(
        "unext",
        streaming,
        rental,
        purchase
      );


    if (unext) {

      result.unext_url =
        createServiceSearchUrl(
          "unext",
          movie.title ||
          movie.original_title ||
          ""
        );

    }


    // =====================================================
    // Hulu
    // =====================================================

    const hulu =
      findProvider(
        "hulu",
        streaming,
        rental,
        purchase
      );


    if (hulu) {

      result.hulu_url =
        createServiceSearchUrl(
          "hulu",
          movie.title ||
          movie.original_title ||
          ""
        );

    }


    // =====================================================
    // Disney+
    // =====================================================

    const disney =
      findProvider(
        "disney",
        streaming,
        rental,
        purchase
      );


    if (disney) {

      result.disney_url =
        createServiceSearchUrl(
          "disney",
          movie.title ||
          movie.original_title ||
          ""
        );

    }


    // =====================================================
    // Apple TV
    // =====================================================

    const apple =
      findProvider(
        "apple",
        streaming,
        rental,
        purchase
      );


    if (apple) {

      result.apple_tv_url =
        createServiceSearchUrl(
          "apple",
          movie.title ||
          movie.original_title ||
          ""
        );

    }


    // =====================================================
    // 結果返却
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
// 配信サービスを整理
// =========================================================

function enrichProviders(
  providers,
  type
) {

  if (
    !Array.isArray(providers)
  ) {

    return [];

  }


  return providers.map(
    function(provider) {

      if (!provider) {

        return null;

      }


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
          null,

        type:
          type

      };

    }
  ).filter(Boolean);

}


// =========================================================
// サービス検索
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
// Netflix ID取得
// =========================================================

function extractNetflixIdFromProvider(
  provider
) {

  if (!provider) {

    return null;

  }


  const possibleUrls = [

    provider.provider_url,

    provider.watch_link,

    provider.url,

    provider.link,

    provider.netflix_url

  ];


  for (
    let i = 0;
    i < possibleUrls.length;
    i++
  ) {

    const id =
      extractNetflixTitleId(
        possibleUrls[i]
      );


    if (id) {

      return id;

    }

  }


  return null;

}


// =========================================================
// Netflix ID
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

    return "https://www.netflix.com/jp/";

  }


  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(clean)
  );

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
// その他サービス検索URL
// =========================================================

function createServiceSearchUrl(
  service,
  title
) {

  const clean =
    String(
      title || ""
    ).trim();


  // -------------------------------------------------------
  // U-NEXT
  // -------------------------------------------------------

  if (
    service === "unext"
  ) {

    return (
      "https://video.unext.jp/search?keyword=" +
      encodeURIComponent(clean)
    );

  }


  // -------------------------------------------------------
  // Hulu
  // -------------------------------------------------------

  if (
    service === "hulu"
  ) {

    return (
      "https://www.hulu.jp/search?q=" +
      encodeURIComponent(clean)
    );

  }


  // -------------------------------------------------------
  // Disney+
  // -------------------------------------------------------

  if (
    service === "disney"
  ) {

    return (
      "https://www.disneyplus.com/ja-jp/search/" +
      encodeURIComponent(clean)
    );

  }


  // -------------------------------------------------------
  // Apple TV
  // -------------------------------------------------------

  if (
    service === "apple"
  ) {

    return (
      "https://tv.apple.com/jp/search?term=" +
      encodeURIComponent(clean)
    );

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
            isValidDate(
              a.release_date
            )
              ? a.release_date
              : "9999-99-99";


          const dateB =
            isValidDate(
              b.release_date
            )
              ? b.release_date
              : "9999-99-99";


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
// 監督
// =========================================================

function getDirector(
  movie
) {

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
          crew[i].id,

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
    Array.isArray(movie.credits.cast)
      ? movie.credits.cast
      : [];


  return cast
    .slice(0, 8)
    .map(function(person) {

      return {

        id:
          person.id,

        name:
          person.name || "",

        character:
          person.character || ""

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


// =========================================================
// 日付判定
// =========================================================

function isValidDate(
  date
) {

  return (
    typeof date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(date)
  );

}
```
