```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// TMDB映画検索 + 日本の配信情報
// =========================================================

export default async function handler(req, res) {

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
    // APIキー
    // =====================================================

    const apiKey =
      process.env.TMDB_API_KEY;

    if (!apiKey) {

      console.error(
        "TMDB_API_KEY is not configured"
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
    // 詳細ページ
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
        error:
          "映画名を入力してください。"
      });

    }

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
// 映画検索
// =========================================================

async function searchMovies(
  query,
  apiKey,
  res
) {

  try {

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
        text
      );

      return res.status(500).json({
        error:
          "TMDB映画検索に失敗しました。"
      });

    }

    const data =
      await response.json();

    const results =
      Array.isArray(data.results)
        ? data.results
        : [];

    // =====================================================
    // タイトル一致度で並べ替え
    // =====================================================

    const movies =
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
            movie: movie,
            score:
              calculateTitleScore(
                query,
                movie
              )
          };

        })
        .sort(function(a, b) {

          if (
            b.score !==
            a.score
          ) {

            return (
              b.score -
              a.score
            );

          }

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
              Number(
                movie.vote_average || 0
              )

          };

        });

    return res.status(200).json({
      results: movies
    });

  } catch (error) {

    console.error(
      "SEARCH ERROR:",
      error
    );

    return res.status(500).json({
      error:
        getErrorMessage(error)
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
    normalizeTitle(query);

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

  if (title === q) {
    return 10000;
  }

  if (title.startsWith(q)) {
    return (
      9000 -
      Math.min(
        title.length,
        500
      )
    );
  }

  if (title.includes(q)) {
    return (
      8000 -
      Math.min(
        title.length,
        500
      )
    );
  }

  if (original === q) {
    return 7500;
  }

  if (original.startsWith(q)) {
    return (
      7000 -
      Math.min(
        original.length,
        500
      )
    );
  }

  if (original.includes(q)) {
    return (
      6000 -
      Math.min(
        original.length,
        500
      )
    );
  }

  return Math.round(
    Math.max(
      characterSimilarity(
        q,
        title
      ),
      characterSimilarity(
        q,
        original
      )
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
        text
      );

      return res.status(404).json({
        error:
          "作品情報を取得できませんでした。"
      });

    }

    const movie =
      await response.json();

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

      director:
        getDirector(movie),

      cast:
        getCast(movie),

      language:
        getLanguageInfo(movie),

      streaming: [],

      rental: [],

      purchase: [],

      link:
        "https://www.themoviedb.org/movie/" +
        movie.id,

      netflix: null,

      netflix_title_id: null,

      netflix_id: null,

      netflix_url: null,

      series: null

    };

    // ===================================================
    // 日本の配信情報
    // ===================================================

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

    // ===================================================
    // Netflix
    // ===================================================

    const netflix =
      findNetflixService(
        result.streaming,
        result.rental,
        result.purchase
      );

    if (netflix) {

      const netflixInfo =
        findNetflixTitleId(
          movie,
          netflix
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

      } else {

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

    // ===================================================
    // シリーズ
    // ===================================================

    if (
      movie.belongs_to_collection
    ) {

      result.series =
        await getCollectionInfo(
          movie.belongs_to_collection,
          apiKey
        );

    }

    // ===================================================
    // TMDB配信ページ
    // ===================================================

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

  } catch (error) {

    console.error(
      "DETAIL ERROR:",
      error
    );

    return res.status(500).json({
      error:
        getErrorMessage(error)
    });

  }

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
  service
) {

  const directIds = [

    service &&
    service.netflix_title_id,

    service &&
    service.netflix_id,

    service &&
    service.title_id,

    service &&
    service.netflixTitleId,

    service &&
    service.netflixTitleID,

    movie &&
    movie.netflix_title_id,

    movie &&
    movie.netflix_id,

    movie &&
    movie.title_id,

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

  // =====================================================
  // URLからIDを探す
  // =====================================================

  const urls = [

    service &&
    service.netflix_url,

    service &&
    service.provider_url,

    service &&
    service.watch_link,

    service &&
    service.url,

    service &&
    service.link,

    movie &&
    movie.netflix_url,

    movie &&
    movie.netflix_link

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
// Netflix URLから作品ID
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

    /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i,

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
      crew[i].job ===
      "Director"
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

  return {

    original_language:
      movie &&
      movie.original_language
        ? movie.original_language
        : null,

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
      "https://api.themoviedb.org/3/collection/" +
      encodeURIComponent(
        collection.id
      ) +
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

    const parts =
      Array.isArray(data.parts)
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
      "COLLECTION ERROR:",
      error
    );

    return null;

  }

}


// =========================================================
// エラーメッセージ
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
