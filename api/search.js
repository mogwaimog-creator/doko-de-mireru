// =========================================================
// doko-de-mireru
// api/search.js
//
// TMDBを利用した映画検索API
//
// ・映画検索
// ・映画詳細
// ・日本の配信情報
// ・Netflix判定
// ・シリーズ情報
//
// Vercel Serverless Function
// =========================================================

export default async function handler(req, res) {

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

  // OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET以外は拒否
  if (req.method !== "GET") {

    return res.status(405).json({
      error: "GETメソッドのみ利用できます。"
    });

  }

  try {

    // =====================================================
    // APIキー
    // =====================================================

    const apiKey =
      process.env.TMDB_API_KEY;

    if (!apiKey) {

      console.error(
        "TMDB_API_KEY is missing"
      );

      return res.status(500).json({
        error:
          "TMDB_API_KEY が設定されていません。VercelのEnvironment Variablesを確認してください。"
      });

    }

    // =====================================================
    // クエリ取得
    // =====================================================

    const query =
      getQueryValue(
        req.query,
        "query"
      );

    const id =
      getQueryValue(
        req.query,
        "id"
      );

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
    // queryがない場合
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
        getErrorMessage(error)
    });

  }

}


// =========================================================
// クエリ値取得
// =========================================================

function getQueryValue(
  queryObject,
  key
) {

  if (
    !queryObject ||
    typeof queryObject !== "object"
  ) {

    return "";

  }

  const value =
    queryObject[key];

  if (
    typeof value === "string"
  ) {

    return value.trim();

  }

  if (
    Array.isArray(value) &&
    value.length > 0
  ) {

    return String(
      value[0]
    ).trim();

  }

  return "";

}


// =========================================================
// 映画検索
// =========================================================

async function searchMovies(
  query,
  apiKey,
  res
) {

  try {

    const url =
      new URL(
        "https://api.themoviedb.org/3/search/movie"
      );

    url.searchParams.set(
      "api_key",
      apiKey
    );

    url.searchParams.set(
      "language",
      "ja-JP"
    );

    url.searchParams.set(
      "region",
      "JP"
    );

    url.searchParams.set(
      "query",
      query
    );

    url.searchParams.set(
      "include_adult",
      "false"
    );

    url.searchParams.set(
      "page",
      "1"
    );

    console.log(
      "TMDB SEARCH:",
      query
    );

    const response =
      await fetch(
        url.toString()
      );

    if (!response.ok) {

      const errorText =
        await response.text();

      console.error(
        "TMDB SEARCH ERROR:",
        response.status,
        errorText
      );

      return res.status(502).json({
        error:
          "TMDB映画検索に失敗しました。"
      });

    }

    const data =
      await response.json();

    const results =
      Array.isArray(
        data.results
      )
        ? data.results
        : [];

    // =====================================================
    // タイトル一致度で並び替え
    // =====================================================

    const sorted =
      results

        .filter(function(movie) {

          return (
            movie &&
            movie.id &&
            movie.title
          );

        })

        .map(function(movie) {

          return {

            movie:
              movie,

            score:
              calculateTitleScore(
                query,
                movie
              )

          };

        })

        .sort(function(a, b) {

          // 一致度
          if (
            b.score !==
            a.score
          ) {

            return (
              b.score -
              a.score
            );

          }

          // 公開日の早い順
          const dateA =
            a.movie.release_date ||
            "9999-99-99";

          const dateB =
            b.movie.release_date ||
            "9999-99-99";

          return dateA.localeCompare(
            dateB
          );

        })

        .slice(
          0,
          10
        );

    // =====================================================
    // フロントへ返す
    // =====================================================

    const movies =
      sorted.map(function(item) {

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
            Number(
              movie.vote_average || 0
            )

        };

      });

    return res.status(200).json({

      results:
        movies

    });

  } catch (error) {

    console.error(
      "SEARCH FUNCTION ERROR:",
      error
    );

    return res.status(500).json({
      error:
        "映画検索中にサーバーエラーが発生しました。"
    });

  }

}


// =========================================================
// タイトル一致度
// =========================================================

function calculateTitleScore(
  query,
  movie
) {

  const q =
    normalizeTitle(
      query
    );

  const title =
    normalizeTitle(
      movie.title || ""
    );

  const original =
    normalizeTitle(
      movie.original_title || ""
    );

  if (!q) {

    return 0;

  }

  // 完全一致
  if (
    title === q
  ) {

    return 10000;

  }

  // 日本語タイトルが検索語で始まる
  if (
    title.startsWith(q)
  ) {

    return (
      9000 -
      Math.min(
        title.length,
        500
      )
    );

  }

  // 日本語タイトルに検索語が含まれる
  if (
    title.includes(q)
  ) {

    return (
      8000 -
      Math.min(
        title.length,
        500
      )
    );

  }

  // 原題完全一致
  if (
    original === q
  ) {

    return 7500;

  }

  // 原題が検索語で始まる
  if (
    original.startsWith(q)
  ) {

    return (
      7000 -
      Math.min(
        original.length,
        500
      )
    );

  }

  // 原題に含まれる
  if (
    original.includes(q)
  ) {

    return (
      6000 -
      Math.min(
        original.length,
        500
      )
    );

  }

  // 文字一致
  const titleSimilarity =
    characterSimilarity(
      q,
      title
    );

  const originalSimilarity =
    characterSimilarity(
      q,
      original
    );

  return Math.round(
    Math.max(
      titleSimilarity,
      originalSimilarity
    ) * 5000
  );

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
    .toLowerCase()
    .replace(
      /[\s　・:：\-ー—–_,，、.!！?？'’"“”「」『』()（）[\]【】]/g,
      ""
    );

}


// =========================================================
// 文字一致率
// =========================================================

function characterSimilarity(
  query,
  title
) {

  if (
    !query ||
    !title
  ) {

    return 0;

  }

  let matched = 0;

  for (
    let i = 0;
    i < query.length;
    i++
  ) {

    if (
      title.includes(
        query[i]
      )
    ) {

      matched++;

    }

  }

  return (
    matched /
    query.length
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

  try {

    const url =
      new URL(
        "https://api.themoviedb.org/3/movie/" +
        encodeURIComponent(
          movieId
        )
      );

    url.searchParams.set(
      "api_key",
      apiKey
    );

    url.searchParams.set(
      "language",
      "ja-JP"
    );

    url.searchParams.set(
      "append_to_response",
      "credits,watch/providers"
    );

    console.log(
      "TMDB DETAIL:",
      movieId
    );

    const response =
      await fetch(
        url.toString()
      );

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
        Number(
          movie.vote_average || 0
        ),

      genres:
        Array.isArray(
          movie.genres
        )
          ? movie.genres
          : [],

      director:
        getDirector(
          movie
        ),

      cast:
        getCast(
          movie
        ),

      language:
        getLanguageInfo(
          movie
        ),

      streaming: [],

      rental: [],

      purchase: [],

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
      getJapanProviders(
        movie
      );

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

      if (
        providers.link
      ) {

        result.link =
          providers.link;

      }

    }

    // =====================================================
    // Netflix
    // =====================================================

    const netflixService =
      findNetflixService(
        result.streaming,
        result.rental,
        result.purchase
      );

    if (
      netflixService
    ) {

      const netflixInfo =
        findNetflixTitleId(
          movie,
          netflixService
        );

      if (
        netflixInfo
      ) {

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

      } else {

        // TMDBにNetflix作品IDがない場合
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

    if (
      movie.belongs_to_collection &&
      movie.belongs_to_collection.id
    ) {

      result.series =
        await getCollectionInfo(
          movie.belongs_to_collection,
          apiKey
        );

    }

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
        "作品情報の取得中にサーバーエラーが発生しました。"
    });

  }

}


// =========================================================
// 日本の配信情報取得
// =========================================================

function getJapanProviders(
  movie
) {

  if (
    !movie ||
    !movie["watch/providers"] ||
    !movie["watch/providers"].results
  ) {

    return null;

  }

  const results =
    movie["watch/providers"].results;

  if (
    !results ||
    typeof results !== "object"
  ) {

    return null;

  }

  return results.JP || null;

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
      )
        .toLowerCase();

    if (
      name.includes(
        "netflix"
      )
    ) {

      return service;

    }

  }

  return null;

}


// =========================================================
// Netflix作品ID
// =========================================================

function findNetflixTitleId(
  movie,
  netflixService
) {

  // =====================================================
  // 直接ID
  // =====================================================

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

    netflixService &&
    netflixService.netflixId,

    movie &&
    movie.netflix_title_id,

    movie &&
    movie.netflix_id,

    movie &&
    movie.netflixTitleId,

    movie &&
    movie.netflixTitleID,

    movie &&
    movie.netflixId

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

  // =====================================================
  // Netflix URLからID
  // =====================================================

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
    netflixService.link,

    movie &&
    movie.netflix_url,

    movie &&
    movie.netflix_link,

    movie &&
    movie.netflixUrl,

    movie &&
    movie.netflix &&
    movie.netflix.url,

    movie &&
    movie.netflix &&
    movie.netflix.link

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
// Netflix URL → ID
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

    const person =
      crew[i];

    if (
      person &&
      person.job ===
        "Director"
    ) {

      return {

        id:
          person.id,

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
    .slice(
      0,
      8
    )
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

  try {

    const url =
      new URL(
        "https://api.themoviedb.org/3/collection/" +
        encodeURIComponent(
          collection.id
        )
      );

    url.searchParams.set(
      "api_key",
      apiKey
    );

    url.searchParams.set(
      "language",
      "ja-JP"
    );

    const response =
      await fetch(
        url.toString()
      );

    if (!response.ok) {

      console.error(
        "COLLECTION ERROR:",
        response.status
      );

      return null;

    }

    const data =
      await response.json();

    const parts =
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
        parts.map(function(movie) {

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
// エラー文字列
// =========================================================

function getErrorMessage(
  error
) {

  if (
    error &&
    typeof error.message ===
      "string"
  ) {

    return error.message;

  }

  if (
    typeof error ===
      "string"
  ) {

    return error;

  }

  return (
    "サーバーでエラーが発生しました。"
  );

}
