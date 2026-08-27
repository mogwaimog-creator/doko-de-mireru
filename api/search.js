```javascript
// =========================================================
// doko-de-mireru
// api/search.js
//
// TMDB映画検索API
// ・映画検索
// ・映画詳細
// ・日本の配信情報
// ・Netflix判定
// ・Netflix作品ID取得
// ・シリーズ情報
// ・監督
// ・出演者
// =========================================================

/*
 * VercelでNode.js Serverless Functionとして動かす
 */
export const config = {
  runtime: "nodejs"
};


/* =========================================================
   メイン
========================================================= */

export default async function handler(req, res) {

  try {

    // -----------------------------------------------------
    // CORS
    // -----------------------------------------------------

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


    // -----------------------------------------------------
    // APIキー
    // -----------------------------------------------------

    const apiKey =
      process.env.TMDB_API_KEY;


    if (
      !apiKey ||
      typeof apiKey !== "string" ||
      !apiKey.trim()
    ) {

      console.error(
        "TMDB_API_KEY がありません"
      );

      return res.status(500).json({
        error:
          "TMDB_API_KEY がVercelに設定されていません。"
      });

    }


    // -----------------------------------------------------
    // クエリ取得
    // -----------------------------------------------------

    const query =
      getQueryParameter(
        req,
        "query"
      );


    const id =
      getQueryParameter(
        req,
        "id"
      );


    // -----------------------------------------------------
    // 詳細
    // -----------------------------------------------------

    if (id) {

      return await getMovieDetail(
        id,
        apiKey,
        res
      );

    }


    // -----------------------------------------------------
    // 検索
    // -----------------------------------------------------

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
      "search.js 致命的エラー:",
      error
    );


    return res.status(500).json({
      error:
        getErrorMessage(error)
    });

  }

}


/* =========================================================
   クエリ取得
========================================================= */

function getQueryParameter(
  req,
  name
) {

  try {

    /*
     * 従来型Vercel Request
     */
    if (
      req &&
      req.query &&
      typeof req.query[name] === "string"
    ) {

      return req.query[name].trim();

    }


    /*
     * 配列の場合
     */
    if (
      req &&
      req.query &&
      Array.isArray(req.query[name])
    ) {

      return String(
        req.query[name][0] || ""
      ).trim();

    }


    /*
     * URLから取得
     */
    if (
      req &&
      req.url
    ) {

      const url =
        new URL(
          req.url,
          "https://doko-de-mireru.vercel.app"
        );

      return (
        url.searchParams.get(name) ||
        ""
      ).trim();

    }

  } catch (error) {

    console.error(
      "クエリ取得エラー:",
      error
    );

  }


  return "";

}


/* =========================================================
   TMDB URL
========================================================= */

function createTMDBUrl(
  path,
  apiKey,
  params
) {

  const url =
    new URL(
      "https://api.themoviedb.org/3" +
      path
    );


  url.searchParams.set(
    "api_key",
    apiKey
  );


  Object.keys(
    params || {}
  ).forEach(
    function(key) {

      const value =
        params[key];


      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {

        url.searchParams.set(
          key,
          String(value)
        );

      }

    }
  );


  return url.toString();

}


/* =========================================================
   TMDB取得
========================================================= */

async function fetchTMDB(
  url
) {

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


  let data = null;


  try {

    data =
      text
        ? JSON.parse(text)
        : null;

  } catch (error) {

    throw new Error(
      "TMDBから正しいJSONを取得できませんでした。"
    );

  }


  if (!response.ok) {

    console.error(
      "TMDB HTTPエラー:",
      response.status,
      data
    );


    if (
      data &&
      data.status_message
    ) {

      throw new Error(
        "TMDB: " +
        data.status_message
      );

    }


    throw new Error(
      "TMDB APIエラー (" +
      response.status +
      ")"
    );

  }


  return data;

}


/* =========================================================
   映画検索
========================================================= */

async function searchMovies(
  query,
  apiKey,
  res
) {

  try {

    const searchUrl =
      createTMDBUrl(
        "/search/movie",
        apiKey,
        {
          language:
            "ja-JP",

          region:
            "JP",

          query:
            query,

          include_adult:
            "false",

          page:
            "1"
        }
      );


    const data =
      await fetchTMDB(
        searchUrl
      );


    const results =
      Array.isArray(
        data &&
        data.results
      )
        ? data.results
        : [];


    /*
     * タイトルがある映画だけ
     */
    const filtered =
      results.filter(
        function(movie) {

          return (
            movie &&
            movie.id &&
            (
              movie.title ||
              movie.original_title
            )
          );

        }
      );


    /*
     * 一致度で並べ替え
     */
    const sorted =
      filtered
        .map(
          function(movie) {

            return {

              movie:
                movie,

              score:
                calculateTitleScore(
                  query,
                  movie
                )

            };

          }
        )
        .sort(
          function(a,b) {

            /*
             * ① 一致度
             */
            if (
              b.score !==
              a.score
            ) {

              return (
                b.score -
                a.score
              );

            }


            /*
             * ② 公開日の早い順
             */
            const dateA =
              a.movie.release_date ||
              "9999-99-99";


            const dateB =
              b.movie.release_date ||
              "9999-99-99";


            return dateA.localeCompare(
              dateB
            );

          }
        )
        .slice(
          0,
          10
        );


    /*
     * index.htmlが使う形式に変換
     */
    const movies =
      sorted.map(
        function(item) {

          const movie =
            item.movie;


          return {

            id:
              movie.id,

            title:
              movie.title ||
              "",

            original_title:
              movie.original_title ||
              "",

            release_date:
              movie.release_date ||
              "",

            poster_path:
              movie.poster_path ||
              null,

            overview:
              movie.overview ||
              "",

            vote_average:
              Number(
                movie.vote_average || 0
              )

          };

        }
      );


    return res.status(200).json({

      results:
        movies

    });


  } catch (error) {

    console.error(
      "映画検索エラー:",
      error
    );


    return res.status(500).json({

      error:
        getErrorMessage(error)

    });

  }

}


/* =========================================================
   タイトル一致度
========================================================= */

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
      movie &&
      movie.title
    );


  const original =
    normalizeTitle(
      movie &&
      movie.original_title
    );


  if (!q) {

    return 0;

  }


  /*
   * 日本語タイトル完全一致
   */
  if (
    title === q
  ) {

    return 10000;

  }


  /*
   * 日本語タイトルが検索語から始まる
   */
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


  /*
   * 日本語タイトルに含まれる
   */
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


  /*
   * 原題完全一致
   */
  if (
    original === q
  ) {

    return 7000;

  }


  /*
   * 原題から始まる
   */
  if (
    original.startsWith(q)
  ) {

    return (
      6500 -
      Math.min(
        original.length,
        500
      )
    );

  }


  /*
   * 原題に含まれる
   */
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


  /*
   * 文字一致率
   */
  const similarity =
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
      similarity,
      originalSimilarity
    ) * 1000
  );

}


/* =========================================================
   タイトル正規化
========================================================= */

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


/* =========================================================
   文字一致率
========================================================= */

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


  let matched =
    0;


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


/* =========================================================
   映画詳細
========================================================= */

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

  try {

    if (
      !/^\d+$/.test(
        String(movieId)
      )
    ) {

      return res.status(400).json({

        error:
          "正しい作品IDではありません。"

      });

    }


    const detailUrl =
      createTMDBUrl(
        "/movie/" +
        encodeURIComponent(
          movieId
        ),
        apiKey,
        {

          language:
            "ja-JP",

          append_to_response:
            "credits,watch/providers"

        }
      );


    const movie =
      await fetchTMDB(
        detailUrl
      );


    if (
      !movie ||
      !movie.id
    ) {

      return res.status(404).json({

        error:
          "作品情報が見つかりませんでした。"

      });

    }


    const result = {

      id:
        movie.id,

      title:
        movie.title ||
        "",

      original_title:
        movie.original_title ||
        "",

      release_date:
        movie.release_date ||
        "",

      poster_path:
        movie.poster_path ||
        null,

      overview:
        movie.overview ||
        "",

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


    /*
     * 日本の配信情報
     */
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


      if (
        providers.link
      ) {

        result.link =
          providers.link;

      }

    }


    /*
     * Netflix
     */
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


    /*
     * シリーズ
     */
    if (
      movie.belongs_to_collection
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
      "映画詳細エラー:",
      error
    );


    return res.status(500).json({

      error:
        getErrorMessage(error)

    });

  }

}


/* =========================================================
   Netflixサービス検索
========================================================= */

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
      name.includes(
        "netflix"
      )
    ) {

      return service;

    }

  }


  return null;

}


/* =========================================================
   Netflix作品ID取得
========================================================= */

function findNetflixTitleId(
  movie,
  netflixService
) {

  /*
   * 直接ID
   */
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


  /*
   * Netflix URL
   */
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


  return null;

}


/* =========================================================
   Netflix検索URL
========================================================= */

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


/* =========================================================
   Netflix URL → ID
========================================================= */

function extractNetflixId(
  url
) {

  if (
    typeof url !== "string" ||
    !url.trim()
  ) {

    return null;

  }


  const value =
    url.trim();


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
      value.match(
        patterns[i]
      );


    if (match) {

      return match[1];

    }

  }


  return null;

}


/* =========================================================
   監督
========================================================= */

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
          crew[i].name ||
          ""

      };

    }

  }


  return null;

}


/* =========================================================
   出演者
========================================================= */

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
    .map(
      function(person) {

        return {

          id:
            person.id,

          name:
            person.name ||
            ""

        };

      }
    );

}


/* =========================================================
   言語情報
========================================================= */

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


/* =========================================================
   シリーズ情報
========================================================= */

async function getCollectionInfo(
  collection,
  apiKey
) {

  try {

    if (
      !collection ||
      !collection.id
    ) {

      return null;

    }


    const url =
      createTMDBUrl(
        "/collection/" +
        encodeURIComponent(
          collection.id
        ),
        apiKey,
        {
          language:
            "ja-JP"
        }
      );


    const data =
      await fetchTMDB(
        url
      );


    const movies =
      Array.isArray(
        data &&
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
        movies.map(
          function(movie) {

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

          }
        )

    };


  } catch (error) {

    console.error(
      "シリーズ情報取得エラー:",
      error
    );


    /*
     * シリーズ情報だけ取れなくても
     * 映画詳細自体は表示できるようにする
     */
    return null;

  }

}


/* =========================================================
   エラー文字列
========================================================= */

function getErrorMessage(
  error
) {

  if (
    error &&
    typeof error.message === "string" &&
    error.message
  ) {

    return error.message;

  }


  if (
    typeof error === "string"
  ) {

    return error;

  }


  if (
    error &&
    typeof error === "object"
  ) {

    try {

      return JSON.stringify(
        error
      );

    } catch (jsonError) {

      return (
        "サーバーでエラーが発生しました。"
      );

    }

  }


  return (
    "サーバーでエラーが発生しました。"
  );

}
```
