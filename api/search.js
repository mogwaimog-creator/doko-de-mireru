```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// TMDBから
// ・映画情報
// ・日本の配信情報
// ・Netflix配信判定
//
// 検索結果は
// ①検索タイトルとの一致度
// ②公開日の早い順
// で並べます。
// =========================================================

export default async function handler(req, res) {

  try {

    // =====================================================
    // 環境変数
    // =====================================================

    const TMDB_API_KEY =
      process.env.TMDB_API_KEY;

    if (!TMDB_API_KEY) {

      return res.status(500).json({
        error:
          "TMDB_API_KEY が設定されていません。"
      });

    }

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
    // ID指定
    // =====================================================

    if (id) {

      return await getMovieDetail(
        id,
        TMDB_API_KEY,
        res
      );

    }

    // =====================================================
    // 映画検索
    // =====================================================

    if (!query) {

      return res.status(400).json({
        error:
          "映画名を入力してください。"
      });

    }

    return await searchMovies(
      query,
      TMDB_API_KEY,
      res
    );

  } catch (error) {

    console.error(
      "search.js error:",
      error
    );

    return res.status(500).json({
      error:
        getErrorMessage(error)
    });

  }

}


// =========================================================
// 映画検索
// =========================================================

async function searchMovies(
  query,
  apiKey,
  res
) {

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

  let results =
    Array.isArray(data.results)
      ? data.results
      : [];

  // =====================================================
  // 検索結果を整理
  // =====================================================

  results =
    results.filter(function(movie) {

      return (
        movie &&
        movie.id &&
        movie.title
      );

    });

  // =====================================================
  // 検索タイトルとの一致度を計算
  //
  // 優先順位
  //
  // 100 = 完全一致
  // 90  = タイトルが検索語で始まる
  // 80  = タイトルに検索語を含む
  // 70  = 原題が検索語で始まる
  // 60  = 原題に検索語を含む
  // 0   = その他
  // =====================================================

  const normalizedQuery =
    normalizeTitle(query);

  results =
    results.map(function(movie) {

      const title =
        normalizeTitle(
          movie.title || ""
        );

      const originalTitle =
        normalizeTitle(
          movie.original_title || ""
        );

      let matchScore = 0;

      if (
        title === normalizedQuery
      ) {

        matchScore = 100;

      } else if (
        title.startsWith(
          normalizedQuery
        )
      ) {

        matchScore = 90;

      } else if (
        title.includes(
          normalizedQuery
        )
      ) {

        matchScore = 80;

      } else if (
        originalTitle === normalizedQuery
      ) {

        matchScore = 70;

      } else if (
        originalTitle.startsWith(
          normalizedQuery
        )
      ) {

        matchScore = 60;

      } else if (
        originalTitle.includes(
          normalizedQuery
        )
      ) {

        matchScore = 50;

      }

      return {
        movie:
          movie,

        matchScore:
          matchScore

      };

    });

  // =====================================================
  // 並べ替え
  //
  // ① 一致度の高いもの
  // ② 公開の早いもの
  // ③ TMDB評価の高いもの
  // =====================================================

  results.sort(function(a, b) {

    // ---------------------------------------------------
    // ① 一致度
    // ---------------------------------------------------

    if (
      b.matchScore !==
      a.matchScore
    ) {

      return (
        b.matchScore -
        a.matchScore
      );

    }

    // ---------------------------------------------------
    // ② 公開日
    // ---------------------------------------------------

    const dateA =
      a.movie.release_date ||
      "9999-99-99";

    const dateB =
      b.movie.release_date ||
      "9999-99-99";

    if (dateA !== dateB) {

      return dateA.localeCompare(
        dateB
      );

    }

    // ---------------------------------------------------
    // ③ TMDB評価
    // ---------------------------------------------------

    const ratingA =
      Number(
        a.movie.vote_average || 0
      );

    const ratingB =
      Number(
        b.movie.vote_average || 0
      );

    return ratingB - ratingA;

  });

  // =====================================================
  // 最大10件
  // =====================================================

  const movies =
    results
      .slice(0, 10)
      .map(function(item) {

        const movie =
          item.movie;

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
            movie.vote_average || 0,

          match_score:
            item.matchScore

        };

      });

  return res.status(200).json({
    results:
      movies
  });

}


// =========================================================
// タイトル正規化
// =========================================================

function normalizeTitle(
  value
) {

  return String(
    value || ""
  )
    .trim()
    .toLowerCase()
    .replace(
      /\s+/g,
      ""
    )
    .replace(
      /[　]/g,
      ""
    )
    .replace(
      /[「」『』【】（）()［］\[\]・:：\-－―]/g,
      ""
    );

}


// =========================================================
// 映画詳細
// =========================================================

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

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
  // 基本情報
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
      movie.vote_average || 0,

    genres:
      Array.isArray(movie.genres)
        ? movie.genres
        : [],

    director:
      getDirector(movie),

    cast:
      getCast(movie),

    language:
      getLanguageInfo(movie),

    streaming:
      [],

    rental:
      [],

    purchase:
      [],

    link:
      "https://www.themoviedb.org/movie/" +
      movie.id,

    netflix:
      null,

    netflix_title_id:
      null,

    netflix_id:
      null,

    netflix_url:
      null,

    series:
      null

  };

  // =====================================================
  // 日本の配信情報
  // =====================================================

  const providers =
    movie &&
    movie["watch/providers"] &&
    movie["watch/providers"].results &&
    movie["watch/providers"].results.JP;

  if (providers) {

    result.streaming =
      Array.isArray(
        providers.flatrate
      )
        ? providers.flatrate
        : [];

    result.rental =
      Array.isArray(
        providers.rent
      )
        ? providers.rent
        : [];

    result.purchase =
      Array.isArray(
        providers.buy
      )
        ? providers.buy
        : [];

  }

  // =====================================================
  // Netflixサービス
  // =====================================================

  const netflixService =
    findNetflixService(
      result.streaming,
      result.rental,
      result.purchase
    );

  if (netflixService) {

    const netflixInfo =
      findNetflixTitleId(
        movie,
        netflixService
      );

    if (netflixInfo) {

      result.netflix = {

        title_id:
          netflixInfo.title_id,

        url:
          netflixInfo.url

      };

      result.netflix_title_id =
        netflixInfo.title_id;

      result.netflix_id =
        netflixInfo.title_id;

      result.netflix_url =
        netflixInfo.url;

    }

    if (!result.netflix_url) {

      result.netflix = {

        title_id:
          null,

        url:
          createNetflixSearchUrl(
            movie.title ||
            movie.original_title ||
            ""
          )

      };

      result.netflix_url =
        result.netflix.url;

    }

  }

  // =====================================================
  // シリーズ
  // =====================================================

  if (movie.belongs_to_collection) {

    result.series =
      await getCollectionInfo(
        movie.belongs_to_collection,
        apiKey
      );

  }

  // =====================================================
  // TMDB / JustWatch 配信ページ
  // =====================================================

  if (
    providers &&
    providers.link
  ) {

    result.link =
      providers.link;

  }

  return res.status(200).json(
    result
  );

}


// =========================================================
// Netflixサービス検索
// =========================================================

function findNetflixService(
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

    const service =
      all[i];

    if (!service) {
      continue;
    }

    const name =
      String(
        service.provider_name ||
        service.name ||
        ""
      ).toLowerCase();

    if (
      name.includes("netflix")
    ) {

      return service;

    }

  }

  return null;

}


// =========================================================
// Netflix作品ID取得
// =========================================================

function findNetflixTitleId(
  movie,
  netflixService
) {

  const directIds = [

    netflixService &&
    netflixService.netflix_title_id,

    netflixService &&
    netflixService.netflix_id,

    netflixService &&
    netflixService.title_id,

    netflixService &&
    netflixService.netflixTitleId,

    netflixService &&
    netflixService.netflixTitleID,

    movie &&
    movie.netflix_title_id,

    movie &&
    movie.netflix_id,

    movie &&
    movie.netflixTitleId,

    movie &&
    movie.netflixTitleID

  ];

  for (
    let i = 0;
    i < directIds.length;
    i++
  ) {

    const value =
      directIds[i];

    if (
      value !== undefined &&
      value !== null &&
      /^\d+$/.test(
        String(value).trim()
      )
    ) {

      const id =
        String(value).trim();

      return {

        title_id:
          id,

        url:
          "https://www.netflix.com/jp/title/" +
          id

      };

    }

  }

  const urls = [

    netflixService &&
    netflixService.netflix_url,

    netflixService &&
    netflixService.provider_url,

    netflixService &&
    netflixService.watch_link,

    netflixService &&
    netflixService.url,

    netflixService &&
    netflixService.link

  ];

  for (
    let i = 0;
    i < urls.length;
    i++
  ) {

    const id =
      extractNetflixId(
        urls[i]
      );

    if (id) {

      return {

        title_id:
          id,

        url:
          "https://www.netflix.com/jp/title/" +
          id

      };

    }

  }

  const movieUrls = [

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
    i < movieUrls.length;
    i++
  ) {

    const id =
      extractNetflixId(
        movieUrls[i]
      );

    if (id) {

      return {

        title_id:
          id,

        url:
          "https://www.netflix.com/jp/title/" +
          id

      };

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

  const cleanTitle =
    String(
      title || ""
    ).trim();

  if (!cleanTitle) {

    return (
      "https://www.netflix.com/jp/"
    );

  }

  return (
    "https://www.netflix.com/jp/search?q=" +
    encodeURIComponent(
      cleanTitle
    )
  );

}


// =========================================================
// Netflix URLからID抽出
// =========================================================

function extractNetflixId(
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

    /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i,

    /netflix\.com\/(?:jp\/)?watch\/(\d+)/i,

    /netflix\.com\/(?:[^/]+\/)?watch\/(\d+)/i

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
          person.id,

        name:
          person.name || ""

      };

    });

}


// =========================================================
// 言語情報
// =========================================================

function getLanguageInfo(
  movie
) {

  const original =
    movie &&
    movie.original_language
      ? movie.original_language
      : null;

  return {

    original_language:
      original,

    subtitle:
      null,

    dubbing:
      null

  };

}


// =========================================================
// シリーズ情報
// =========================================================

async function getCollectionInfo(
  collection,
  apiKey
) {

  if (
    !collection ||
    !collection.id
  ) {

    return null;

  }

  const url =
    "https://api.themoviedb.org/3/collection/" +
    encodeURIComponent(
      collection.id
    ) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP";

  try {

    const response =
      await fetch(url);

    if (!response.ok) {

      return null;

    }

    const data =
      await response.json();

    const movies =
      Array.isArray(
        data.parts
      )
        ? data.parts
        : [];

    return {

      name:
        data.name ||
        collection.name ||
        "",

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


// =========================================================
// エラー文字列化
//
// [object Object] を防止
// =========================================================

function getErrorMessage(
  error
) {

  if (!error) {

    return (
      "不明なエラーが発生しました。"
    );

  }

  if (
    typeof error === "string"
  ) {

    return error;

  }

  if (
    error instanceof Error &&
    error.message
  ) {

    return error.message;

  }

  if (
    typeof error.message === "string"
  ) {

    return error.message;

  }

  if (
    typeof error.error === "string"
  ) {

    return error.error;

  }

  try {

    return JSON.stringify(
      error
    );

  } catch (e) {

    return (
      "サーバーでエラーが発生しました。"
    );

  }

}
```
