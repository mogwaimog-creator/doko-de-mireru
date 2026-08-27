export default async function handler(req, res) {

  /*
   * =========================================
   * 基本設定
   * =========================================
   */

  const apiKey = process.env.TMDB_API_KEY;


  try {

    /*
     * =========================================
     * APIキー確認
     * =========================================
     */

    if (!apiKey) {

      return res.status(500).json({

        error:
          "TMDB APIキーが設定されていません"

      });

    }


    /*
     * =========================================
     * キャッシュ
     * =========================================
     */

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=3600"
    );


    /*
     * =========================================
     * 詳細表示
     * =========================================
     */

    const movieId =
      req.query.id;


    if (movieId) {

      return await getMovieDetail(
        movieId,
        apiKey,
        res
      );

    }


    /*
     * =========================================
     * 映画検索
     * =========================================
     */

    const query =
      req.query.query;


    if (!query) {

      return res.status(400).json({

        error:
          "映画名を入力してください"

      });

    }


    /*
     * =========================================
     * TMDB検索
     * =========================================
     */

    const searchUrl =
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&query=" +
      encodeURIComponent(query) +
      "&region=JP" +
      "&include_adult=false";


    const searchResponse =
      await fetch(searchUrl);


    if (!searchResponse.ok) {

      throw new Error(
        "TMDB検索に失敗しました"
      );

    }


    const searchData =
      await searchResponse.json();


    if (
      !searchData.results ||
      searchData.results.length === 0
    ) {

      return res.status(404).json({

        error:
          "映画が見つかりませんでした"

      });

    }


    /*
     * =========================================
     * 最大10作品
     * =========================================
     */

    const rawMovies =
      searchData.results.slice(0, 10);


    /*
     * =========================================
     * シリーズ情報確認
     * =========================================
     */

    const moviesWithSeries =
      await Promise.all(

        rawMovies.map(
          async function(movie) {

            let collection = null;


            try {

              const detailUrl =
                "https://api.themoviedb.org/3/movie/" +
                movie.id +
                "?api_key=" +
                encodeURIComponent(apiKey) +
                "&language=ja-JP";


              const detailResponse =
                await fetch(detailUrl);


              if (detailResponse.ok) {

                const detailData =
                  await detailResponse.json();


                collection =
                  detailData.belongs_to_collection ||
                  null;

              }

            }

            catch (error) {

              console.error(
                "シリーズ確認エラー:",
                error
              );

            }


            return {

              id:
                movie.id,

              title:
                movie.title,

              original_title:
                movie.original_title,

              release_date:
                movie.release_date,

              overview:
                movie.overview,

              poster_path:
                movie.poster_path,

              vote_average:
                movie.vote_average,

              collection:
                collection

            };

          }
        )

      );


    /*
     * =========================================
     * シリーズ整理
     * =========================================
     */

    const seriesGroups = {};

    const normalMovies = [];


    moviesWithSeries.forEach(
      function(movie) {

        if (
          !movie.title ||
          movie.title
            .toLowerCase()
            .includes("untitled")
        ) {

          return;

        }


        if (movie.collection) {

          const collectionId =
            movie.collection.id;


          if (!seriesGroups[collectionId]) {

            seriesGroups[collectionId] = [];

          }


          seriesGroups[collectionId].push(
            movie
          );

        }

        else {

          normalMovies.push(
            movie
          );

        }

      }
    );


    /*
     * =========================================
     * シリーズを公開順
     * =========================================
     */

    let sortedSeriesMovies = [];


    Object.keys(seriesGroups).forEach(
      function(collectionId) {

        const group =
          seriesGroups[collectionId];


        group.sort(
          function(a, b) {

            const dateA =
              a.release_date ||
              "9999-99-99";


            const dateB =
              b.release_date ||
              "9999-99-99";


            return dateA.localeCompare(
              dateB
            );

          }
        );


        sortedSeriesMovies =
          sortedSeriesMovies.concat(
            group
          );

      }
    );


    /*
     * =========================================
     * 最終結果
     * =========================================
     */

    const movies =
      sortedSeriesMovies
        .concat(normalMovies)
        .slice(0, 10)
        .map(
          function(movie) {

            return {

              id:
                movie.id,

              title:
                movie.title,

              original_title:
                movie.original_title,

              release_date:
                movie.release_date,

              vote_average:
                movie.vote_average,

              overview:
                movie.overview,

              poster_path:
                movie.poster_path

            };

          }
        );


    return res.status(200).json({

      results:
        movies

    });

  }

  catch (error) {

    console.error(
      "検索エラー:",
      error
    );


    return res.status(500).json({

      error:
        "検索中にエラーが発生しました"

    });

  }

}


/*
 * =========================================
 * 作品詳細
 * =========================================
 */

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

  /*
   * =========================================
   * TMDB作品情報
   * =========================================
   */

  const detailUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&append_to_response=credits";


  const detailResponse =
    await fetch(detailUrl);


  if (!detailResponse.ok) {

    return res.status(404).json({

      error:
        "作品情報を取得できませんでした"

    });

  }


  const detailData =
    await detailResponse.json();


  if (
    !detailData ||
    !detailData.id
  ) {

    return res.status(404).json({

      error:
        "作品が見つかりませんでした"

    });

  }


  /*
   * =========================================
   * TMDB配信情報
   * =========================================
   */

  const providersUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "/watch/providers" +
    "?api_key=" +
    encodeURIComponent(apiKey);


  const providersResponse =
    await fetch(providersUrl);


  let providersData = {};


  if (providersResponse.ok) {

    providersData =
      await providersResponse.json();

  }


  /*
   * =========================================
   * 日本
   * =========================================
   */

  const japan =
    providersData.results &&
    providersData.results.JP
      ? providersData.results.JP
      : {};


  /*
   * =========================================
   * JustWatch
   * =========================================
   */

  let justWatchInfo = null;


  try {

    justWatchInfo =
      await getJustWatchInfo(
        detailData.id,
        detailData.title,
        detailData.release_date
      );

  }

  catch (error) {

    console.error(
      "JustWatch情報取得エラー:",
      error
    );

  }


  /*
   * =========================================
   * 配信サービス
   * =========================================
   */

  const streaming =
    normalizeProviders(
      japan.flatrate || [],
      japan.link || null,
      justWatchInfo
    );


  const rental =
    normalizeProviders(
      japan.rent || [],
      japan.link || null,
      justWatchInfo
    );


  const purchase =
    normalizeProviders(
      japan.buy || [],
      japan.link || null,
      justWatchInfo
    );


  /*
   * =========================================
   * シリーズ
   * =========================================
   */

  let collection = null;

  let seriesMovies = [];


  if (detailData.belongs_to_collection) {

    collection =
      detailData.belongs_to_collection;


    const collectionUrl =
      "https://api.themoviedb.org/3/collection/" +
      encodeURIComponent(collection.id) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP";


    const collectionResponse =
      await fetch(collectionUrl);


    if (collectionResponse.ok) {

      const collectionData =
        await collectionResponse.json();


      if (
        collectionData.parts &&
        collectionData.parts.length
      ) {

        seriesMovies =
          collectionData.parts

            .filter(
              function(item) {

                if (!item.title) {

                  return false;

                }


                return !item.title
                  .toLowerCase()
                  .includes("untitled");

              }
            )

            .sort(
              function(a, b) {

                const dateA =
                  a.release_date ||
                  "9999-99-99";


                const dateB =
                  b.release_date ||
                  "9999-99-99";


                return dateA.localeCompare(
                  dateB
                );

              }
            )

            .map(
              function(item) {

                return {

                  id:
                    item.id,

                  title:
                    item.title,

                  release_date:
                    item.release_date,

                  poster_path:
                    item.poster_path

                };

              }
            );

      }

    }

  }


  /*
   * =========================================
   * 監督
   * =========================================
   */

  let director = null;


  if (
    detailData.credits &&
    detailData.credits.crew
  ) {

    director =
      detailData.credits.crew.find(
        function(person) {

          return (
            person.job === "Director"
          );

        }
      ) || null;

  }


  /*
   * =========================================
   * 出演者
   * =========================================
   */

  let cast = [];


  if (
    detailData.credits &&
    detailData.credits.cast
  ) {

    cast =
      detailData.credits.cast
        .slice(0, 8)
        .map(
          function(person) {

            return {

              name:
                person.name,

              character:
                person.character

            };

          }
        );

  }


  /*
   * =========================================
   * 完成データ
   * =========================================
   */

  return res.status(200).json({

    id:
      detailData.id,

    title:
      detailData.title,

    original_title:
      detailData.original_title,

    release_date:
      detailData.release_date,

    overview:
      detailData.overview,

    poster_path:
      detailData.poster_path,

    vote_average:
      detailData.vote_average || 0,

    genres:
      detailData.genres || [],

    director:
      director
        ? {
            name:
              director.name
          }
        : null,

    cast:
      cast,

    streaming:
      streaming,

    rental:
      rental,

    purchase:
      purchase,

    /*
     * =========================================
     * Netflix情報
     * =========================================
     */

    netflix:
      justWatchInfo &&
      justWatchInfo.netflix
        ? justWatchInfo.netflix
        : null,

    /*
     * =========================================
     * JustWatchサービス情報
     * =========================================
     */

    justwatch:
      justWatchInfo
        ? justWatchInfo.offers
        : [],

    /*
     * =========================================
     * TMDB配信ページ
     * =========================================
     */

    link:
      japan.link || null,

    providers_updated_at:
      new Date().toISOString(),

    providers_region:
      "JP",

    providers_source:
      "TMDB / JustWatch",

    series:

      collection

        ? {

            id:
              collection.id,

            name:
              collection.name,

            movies:
              seriesMovies

          }

        : null

  });

}


/*
 * =========================================
 * JustWatch検索
 * =========================================
 */

async function getJustWatchInfo(
  tmdbId,
  title,
  releaseDate
) {

  const endpoint =
    "https://apis.justwatch.com/graphql";


  const query = `

    query SearchTitles(
      $country: Country!,
      $searchQuery: String!
    ) {

      popularTitles(
        country: $country,
        filter: {
          searchQuery: $searchQuery,
          objectTypes: [MOVIE]
        },
        first: 20
      ) {

        edges {

          node {

            id

            objectId

            objectType

            content(
              country: $country,
              language: ja
            ) {

              title

              originalReleaseYear

              fullPath

              externalIds {

                imdbId

                tmdbId

              }

            }

            offers(
              country: $country,
              platform: WEB,
              bestOnly: true
            ) {

              standardWebURL

              package {

                clearName

                shortName

              }

            }

          }

        }

      }

    }

  `;


  const year =
    releaseDate
      ? Number(
          String(releaseDate).substring(0, 4)
        )
      : null;


  let data = null;


  try {

    data =
      await justWatchGraphQL(
        endpoint,
        query,
        {
          country: "JP",
          searchQuery: title
        }
      );

  }

  catch (error) {

    console.error(
      "JustWatch検索失敗:",
      error
    );

    return null;

  }


  const edges =
    data &&
    data.data &&
    data.data.popularTitles &&
    Array.isArray(
      data.data.popularTitles.edges
    )
      ? data.data.popularTitles.edges
      : [];


  let matched = null;


  /*
   * =========================================
   * ① TMDB ID照合
   * =========================================
   */

  for (
    let i = 0;
    i < edges.length;
    i++
  ) {

    const node =
      edges[i] &&
      edges[i].node;


    if (
      !node ||
      !node.content
    ) {

      continue;

    }


    const externalIds =
      node.content.externalIds || {};


    if (
      externalIds.tmdbId &&
      String(externalIds.tmdbId) ===
      String(tmdbId)
    ) {

      matched =
        node;

      break;

    }

  }


  /*
   * =========================================
   * ② タイトル＋公開年
   * =========================================
   */

  if (!matched) {

    for (
      let i = 0;
      i < edges.length;
      i++
    ) {

      const node =
        edges[i] &&
        edges[i].node;


      if (
        !node ||
        !node.content
      ) {

        continue;

      }


      const content =
        node.content;


      const sameTitle =
        normalizeTitle(
          content.title
        ) ===
        normalizeTitle(
          title
        );


      const sameYear =
        !year ||
        !content.originalReleaseYear ||
        Number(
          content.originalReleaseYear
        ) === year;


      if (
        sameTitle &&
        sameYear
      ) {

        matched =
          node;

        break;

      }

    }

  }


  /*
   * =========================================
   * 見つからなければ終了
   * =========================================
   */

  if (!matched) {

    return null;

  }


  /*
   * =========================================
   * JustWatch作品情報
   * =========================================
   */

  const content =
    matched.content || {};


  const justWatchPath =
    content.fullPath || null;


  /*
   * =========================================
   * 各サービス
   * =========================================
   */

  const offers =
    Array.isArray(
      matched.offers
    )
      ? matched.offers
      : [];


  const serviceUrls = [];


  offers.forEach(
    function(offer) {

      if (
        !offer ||
        typeof offer.standardWebURL !==
        "string"
      ) {

        return;

      }


      if (
        !offer.package
      ) {

        return;

      }


      const clearName =
        offer.package.clearName ||
        "";


      const shortName =
        offer.package.shortName ||
        "";


      serviceUrls.push({

        provider_name:
          clearName,

        short_name:
          shortName,

        url:
          offer.standardWebURL

      });

    }
  );


  /*
   * =========================================
   * Netflix
   * =========================================
   */

  let netflix = null;


  for (
    let i = 0;
    i < serviceUrls.length;
    i++
  ) {

    const item =
      serviceUrls[i];


    if (
      /netflix/i.test(
        item.provider_name
      ) ||
      String(
        item.short_name
      ).toLowerCase() === "nfx"
    ) {

      const match =
        item.url.match(
          /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i
        );


      if (match) {

        netflix = {

          title_id:
            match[1],

          url:
            item.url

        };

        break;

      }

    }

  }


  return {

    netflix:
      netflix,

    offers:
      serviceUrls,

    justwatch_path:
      justWatchPath

  };

}


/*
 * =========================================
 * JustWatch GraphQL
 * =========================================
 */

async function justWatchGraphQL(
  endpoint,
  query,
  variables
) {

  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      function() {

        controller.abort();

      },
      8000
    );


  try {

    const response =
      await fetch(
        endpoint,
        {

          method:
            "POST",

          headers: {

            "Content-Type":
              "application/json",

            "Accept":
              "application/json"

          },

          body:
            JSON.stringify({

              query:
                query,

              variables:
                variables

            }),

          signal:
            controller.signal

        }
      );


    if (!response.ok) {

      throw new Error(
        "JustWatch HTTP " +
        response.status
      );

    }


    const json =
      await response.json();


    if (
      json.errors &&
      json.errors.length
    ) {

      throw new Error(
        "JustWatch GraphQLエラー"
      );

    }


    return json;

  }

  finally {

    clearTimeout(timeout);

  }

}


/*
 * =========================================
 * タイトル正規化
 * =========================================
 */

function normalizeTitle(
  value
) {

  return String(
    value || ""
  )
    .toLowerCase()
    .replace(
      /[\s　「」『』・:：!！?？,.，．'’"“”()（）【】\[\]{}]/g,
      ""
    );

}


/*
 * =========================================
 * 配信サービス整理
 * =========================================
 */

function normalizeProviders(
  providers,
  watchLink,
  justWatchInfo
) {

  if (
    !Array.isArray(providers)
  ) {

    return [];

  }


  const unique =
    new Map();


  /*
   * =========================================
   * TMDB側の重複削除
   * =========================================
   */

  providers.forEach(
    function(provider) {

      if (
        !provider ||
        !provider.provider_id
      ) {

        return;

      }


      const id =
        String(
          provider.provider_id
        );


      if (
        !unique.has(id)
      ) {

        unique.set(
          id,
          provider
        );

      }

    }
  );


  const result =
    Array.from(
      unique.values()
    );


  /*
   * =========================================
   * 表示順
   * =========================================
   */

  result.sort(
    function(a, b) {

      const priorityA =
        Number.isFinite(
          Number(
            a.display_priority
          )
        )
          ? Number(
              a.display_priority
            )
          : 9999;


      const priorityB =
        Number.isFinite(
          Number(
            b.display_priority
          )
        )
          ? Number(
              b.display_priority
            )
          : 9999;


      if (
        priorityA !==
        priorityB
      ) {

        return (
          priorityA -
          priorityB
        );

      }


      return String(
        a.provider_name || ""
      ).localeCompare(
        String(
          b.provider_name || ""
        ),
        "ja"
      );

    }
  );


  /*
   * =========================================
   * サービスURL
   * =========================================
   */

  return result.map(
    function(provider) {

      const normalizedName =
        normalizeProviderName(
          provider.provider_name || ""
        );


      const isNetflix =
        normalizedName
          .toLowerCase()
          .includes("netflix");


      /*
       * JustWatchから
       * このサービスのURLを探す
       */

      let providerUrl = null;


      if (
        justWatchInfo &&
        Array.isArray(
          justWatchInfo.offers
        )
      ) {

        const target =
          normalizedName
            .toLowerCase();


        for (
          let i = 0;
          i < justWatchInfo.offers.length;
          i++
        ) {

          const offer =
            justWatchInfo.offers[i];


          if (
            !offer ||
            !offer.url
          ) {

            continue;

          }


          const offerName =
            String(
              offer.provider_name || ""
            )
              .toLowerCase();


          const shortName =
            String(
              offer.short_name || ""
            )
              .toLowerCase();


          if (
            providerMatches(
              target,
              offerName,
              shortName
            )
          ) {

            providerUrl =
              offer.url;

            break;

          }

        }

      }


      /*
       * Netflix ID
       */

      let netflixTitleId = null;

      let netflixUrl = null;


      if (
        isNetflix &&
        justWatchInfo &&
        justWatchInfo.netflix
      ) {

        netflixTitleId =
          justWatchInfo.netflix.title_id ||
          null;


        netflixUrl =
          justWatchInfo.netflix.url ||
          null;

      }


      return {

        provider_id:
          provider.provider_id,

        provider_name:
          normalizedName,

        logo_path:
          provider.logo_path ||
          null,

        display_priority:
          provider.display_priority ??
          9999,

        /*
         * TMDB配信ページ
         */

        watch_link:
          watchLink ||
          null,

        /*
         * JustWatch作品ページ
         */

        provider_url:
          providerUrl,

        /*
         * Netflix
         */

        netflix_title_id:
          netflixTitleId,

        netflix_url:
          netflixUrl

      };

    }
  );

}


/*
 * =========================================
 * サービス一致判定
 * =========================================
 */

function providerMatches(
  target,
  offerName,
  shortName
) {

  /*
   * Netflix
   */

  if (
    target.includes("netflix")
  ) {

    return (
      offerName.includes("netflix") ||
      shortName === "nfx"
    );

  }


  /*
   * Amazon Prime Video
   */

  if (
    target.includes("amazon") ||
    target.includes("prime")
  ) {

    return (
      offerName.includes("amazon") ||
      offerName.includes("prime") ||
      shortName.includes("prime")
    );

  }


  /*
   * U-NEXT
   */

  if (
    target.includes("u-next")
  ) {

    return (
      offerName.includes("u-next") ||
      offerName.includes("unext")
    );

  }


  /*
   * Hulu
   */

  if (
    target.includes("hulu")
  ) {

    return offerName.includes("hulu");

  }


  /*
   * Disney+
   */

  if (
    target.includes("disney")
  ) {

    return offerName.includes("disney");

  }


  /*
   * Apple TV
   */

  if (
    target.includes("apple")
  ) {

    return offerName.includes("apple");

  }


  /*
   * FOD
   */

  if (
    target.includes("fod")
  ) {

    return offerName.includes("fod");

  }


  /*
   * Google Play
   */

  if (
    target.includes("google")
  ) {

    return offerName.includes("google");

  }


  return false;

}


/*
 * =========================================
 * サービス名整理
 * =========================================
 */

function normalizeProviderName(
  name
) {

  const value =
    String(
      name || ""
    ).trim();


  /*
   * Amazon
   */

  if (
    value === "Prime Video" ||
    value === "Amazon Prime Video"
  ) {

    return "Amazon Prime Video";

  }


  /*
   * Netflix
   */

  if (
    value === "Netflix"
  ) {

    return "Netflix";

  }


  /*
   * U-NEXT
   */

  if (
    value === "U-NEXT"
  ) {

    return "U-NEXT";

  }


  /*
   * Disney+
   */

  if (
    value === "Disney Plus" ||
    value === "Disney+"
  ) {

    return "Disney+";

  }


  /*
   * Hulu
   */

  if (
    value === "Hulu"
  ) {

    return "Hulu";

  }


  /*
   * Apple TV
   */

  if (
    value === "Apple TV" ||
    value === "Apple TV Plus"
  ) {

    return "Apple TV";

  }


  /*
   * Google Play
   */

  if (
    value === "Google Play Movies" ||
    value === "Google Play"
  ) {

    return "Google Play Movies";

  }


  /*
   * FOD
   */

  if (
    value === "FOD"
  ) {

    return "FOD";

  }


  return value;

}
