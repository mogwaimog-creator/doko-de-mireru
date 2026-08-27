export default async function handler(req, res) {

  /*
   * =========================================
   * 基本設定
   * =========================================
   */

  const CACHE_SECONDS = 60 * 60 * 24;

  try {

    /*
     * =========================================
     * APIキー確認
     * =========================================
     */

    const apiKey =
      process.env.TMDB_API_KEY;

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
     * ID指定
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
     * 映画名検索
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
      !searchData.results.length
    ) {

      return res.status(404).json({
        error:
          "映画が見つかりませんでした"
      });

    }


    /*
     * =========================================
     * 最大10件
     * =========================================
     */

    const rawMovies =
      searchData.results
        .slice(0, 10);


    /*
     * =========================================
     * シリーズ情報
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
     * 結果
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
   * TMDB作品詳細
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
   * 日本の配信情報
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


  const japan =
    providersData.results &&
    providersData.results.JP
      ? providersData.results.JP
      : {};


  /*
   * =========================================
   * JustWatch情報
   * =========================================
   */

  let justWatchInfo = null;


  try {

    justWatchInfo =
      await getJustWatchInfo(
        detailData.id,
        detailData.title,
        detailData.original_title,
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
   * Netflix直接URL
   * =========================================
   */

  let netflix =
    justWatchInfo &&
    justWatchInfo.netflix
      ? justWatchInfo.netflix
      : null;


  /*
   * =========================================
   * 配信サービス整理
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
            person.job ===
            "Director"
          );

        }
      ) || null;

  }


  /*
   * =========================================
   * 出演
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
   * Netflixが配信情報に存在するか
   * =========================================
   */

  const allProviders = []
    .concat(
      japan.flatrate || []
    )
    .concat(
      japan.rent || []
    )
    .concat(
      japan.buy || []
    );


  const hasNetflix =
    allProviders.some(
      function(provider) {

        return (
          provider &&
          String(
            provider.provider_name || ""
          )
            .toLowerCase()
            .includes("netflix")
        );

      }
    );


  /*
   * =========================================
   * 結果
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
     * Netflix情報
     */

    netflix:
      netflix,

    /*
     * Netflix配信中か
     */

    netflix_available:
      hasNetflix,

    /*
     * TMDB配信情報ページ
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
 * JustWatch情報取得
 * =========================================
 */

async function getJustWatchInfo(
  tmdbId,
  title,
  originalTitle,
  releaseDate
) {

  const endpoint =
    "https://apis.justwatch.com/graphql";


  /*
   * =========================================
   * 現在のJustWatch GraphQL形式
   * =========================================
   */

  const query = `

    query GetSuggestedTitles(
      $country: Country!,
      $language: Language!,
      $first: Int!,
      $filter: TitleFilter
    ) {

      popularTitles(
        country: $country,
        first: $first,
        filter: $filter
      ) {

        edges {

          node {

            id

            objectType

            objectId

            content(
              country: $country,
              language: $language
            ) {

              title

              originalReleaseYear

              fullPath

              externalIds {

                imdbId

                tmdbId

              }

            }

            watchNowOffer(
              country: $country,
              platform: WEB
            ) {

              id

              standardWebURL

              package {

                id

                packageId

                clearName

                shortName

              }

            }

            offers(
              country: $country,
              platform: WEB
            ) {

              id

              standardWebURL

              monetizationType

              presentationType

              package {

                id

                packageId

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
          String(releaseDate)
            .substring(0, 4)
        )
      : null;


  /*
   * =========================================
   * 日本語タイトルで検索
   * =========================================
   */

  let data = null;


  try {

    data =
      await justWatchGraphQL(
        endpoint,
        query,
        {

          country:
            "JP",

          language:
            "ja",

          first:
            20,

          filter: {

            searchQuery:
              title,

            objectTypes:
              ["MOVIE"]

          }

        }
      );

  }

  catch (error) {

    console.error(
      "JustWatch日本語検索失敗:",
      error
    );

  }


  /*
   * =========================================
   * 日本語で見つからなければ
   * 原題でも検索
   * =========================================
   */

  let edges =
    getJustWatchEdges(data);


  if (
    !edges.length &&
    originalTitle &&
    originalTitle !== title
  ) {

    try {

      data =
        await justWatchGraphQL(
          endpoint,
          query,
          {

            country:
              "JP",

            language:
              "en",

            first:
              20,

            filter: {

              searchQuery:
                originalTitle,

              objectTypes:
                ["MOVIE"]

            }

          }
        );

    }

    catch (error) {

      console.error(
        "JustWatch原題検索失敗:",
        error
      );

    }


    edges =
      getJustWatchEdges(data);

  }


  if (!edges.length) {

    return {

      netflix:
        null,

      offers:
        []

    };

  }


  /*
   * =========================================
   * TMDB IDで完全一致
   * =========================================
   */

  let matched = null;


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


    const justWatchTmdbId =
      externalIds.tmdbId;


    if (
      justWatchTmdbId &&
      String(justWatchTmdbId) ===
      String(tmdbId)
    ) {

      matched =
        node;

      break;

    }

  }


  /*
   * =========================================
   * TMDB IDがなければ
   * タイトル＋公開年
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
   * まだ見つからなければ原題
   * =========================================
   */

  if (!matched && originalTitle) {

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
          originalTitle
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


  if (!matched) {

    return {

      netflix:
        null,

      offers:
        []

    };

  }


  /*
   * =========================================
   * Offers
   * =========================================
   */

  const offers = [];


  /*
   * watchNowOffer
   */

  if (
    matched.watchNowOffer &&
    matched.watchNowOffer.standardWebURL
  ) {

    offers.push({

      provider_name:
        matched.watchNowOffer.package &&
        matched.watchNowOffer.package.clearName
          ? matched.watchNowOffer.package.clearName
          : "",

      short_name:
        matched.watchNowOffer.package &&
        matched.watchNowOffer.package.shortName
          ? matched.watchNowOffer.package.shortName
          : "",

      url:
        matched.watchNowOffer.standardWebURL

    });

  }


  /*
   * 通常offers
   */

  if (
    Array.isArray(
      matched.offers
    )
  ) {

    matched.offers.forEach(
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


        offers.push({

          provider_name:
            offer.package.clearName ||
            "",

          short_name:
            offer.package.shortName ||
            "",

          url:
            offer.standardWebURL

        });

      }
    );

  }


  /*
   * =========================================
   * 重複削除
   * =========================================
   */

  const uniqueOffers = [];

  const seenUrls = {};


  offers.forEach(
    function(offer) {

      if (
        !offer ||
        !offer.url
      ) {

        return;

      }


      if (
        seenUrls[offer.url]
      ) {

        return;

      }


      seenUrls[offer.url] =
        true;


      uniqueOffers.push(
        offer
      );

    }
  );


  /*
   * =========================================
   * Netflix URL
   * =========================================
   */

  let netflix = null;


  for (
    let i = 0;
    i < uniqueOffers.length;
    i++
  ) {

    const offer =
      uniqueOffers[i];


    const providerName =
      String(
        offer.provider_name || ""
      )
        .toLowerCase();


    const shortName =
      String(
        offer.short_name || ""
      )
        .toLowerCase();


    const isNetflix =
      providerName.includes("netflix") ||
      shortName === "nfx";


    if (!isNetflix) {

      continue;

    }


    const url =
      String(
        offer.url || ""
      );


    /*
     * Netflix作品ページ
     *
     * /title/数字
     */

    const match =
      url.match(
        /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i
      );


    if (match) {

      netflix = {

        title_id:
          match[1],

        url:
          url

      };


      break;

    }

  }


  /*
   * =========================================
   * Netflixが見つからない場合
   * =========================================
   *
   * Netflixの作品IDが取れない場合は
   * nullのまま返す。
   *
   * 嘘のIDは作らない。
   *
   * =========================================
   */

  return {

    netflix:
      netflix,

    offers:
      uniqueOffers

  };

}


/*
 * =========================================
 * JustWatch edges取得
 * =========================================
 */

function getJustWatchEdges(
  data
) {

  if (
    !data ||
    !data.data ||
    !data.data.popularTitles ||
    !Array.isArray(
      data.data.popularTitles.edges
    )
  ) {

    return [];

  }


  return data.data.popularTitles.edges;

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
      10000
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
              "application/json",

            "User-Agent":
              "Mozilla/5.0"

          },

          body:
            JSON.stringify({

              operationName:
                "GetSuggestedTitles",

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

      console.error(
        "JustWatch GraphQL errors:",
        JSON.stringify(
          json.errors
        )
      );


      throw new Error(
        "JustWatch GraphQLエラー"
      );

    }


    return json;

  }

  finally {

    clearTimeout(
      timeout
    );

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


  providers.forEach(
    function(provider) {

      if (
        !provider ||
        !provider.provider_id
      ) {

        return;

      }


      const providerId =
        String(
          provider.provider_id
        );


      if (
        !unique.has(providerId)
      ) {

        unique.set(
          providerId,
          provider
        );

      }

    }
  );


  const result =
    Array.from(
      unique.values()
    );


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


  return result.map(
    function(provider) {

      const originalName =
        provider.provider_name ||
        "";


      const normalizedName =
        normalizeProviderName(
          originalName
        );


      const isNetflix =
        normalizedName
          .toLowerCase()
          .includes("netflix");


      /*
       * =========================================
       * JustWatch URL
       * =========================================
       */

      let providerUrl = null;


      if (
        justWatchInfo &&
        Array.isArray(
          justWatchInfo.offers
        )
      ) {

        const targetName =
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


          let matchedProvider =
            false;


          /*
           * Netflix
           */

          if (
            targetName.includes("netflix") &&
            (
              offerName.includes("netflix") ||
              shortName === "nfx"
            )
          ) {

            matchedProvider =
              true;

          }


          /*
           * Amazon
           */

          else if (
            (
              targetName.includes("prime") ||
              targetName.includes("amazon")
            ) &&
            (
              offerName.includes("amazon") ||
              offerName.includes("prime")
            )
          ) {

            matchedProvider =
              true;

          }


          /*
           * U-NEXT
           */

          else if (
            targetName.includes("u-next") &&
            offerName.includes("u-next")
          ) {

            matchedProvider =
              true;

          }


          /*
           * Hulu
           */

          else if (
            targetName.includes("hulu") &&
            offerName.includes("hulu")
          ) {

            matchedProvider =
              true;

          }


          /*
           * Disney+
           */

          else if (
            targetName.includes("disney") &&
            offerName.includes("disney")
          ) {

            matchedProvider =
              true;

          }


          /*
           * Apple TV
           */

          else if (
            targetName.includes("apple") &&
            offerName.includes("apple")
          ) {

            matchedProvider =
              true;

          }


          /*
           * FOD
           */

          else if (
            targetName.includes("fod") &&
            offerName.includes("fod")
          ) {

            matchedProvider =
              true;

          }


          /*
           * Google Play
           */

          else if (
            targetName.includes("google") &&
            offerName.includes("google")
          ) {

            matchedProvider =
              true;

          }


          if (
            matchedProvider
          ) {

            providerUrl =
              offer.url;

            break;

          }

        }

      }


      /*
       * =========================================
       * Netflix作品ID
       * =========================================
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


      /*
       * =========================================
       * Netflixの場合
       *
       * 作品URLを最優先
       * =========================================
       */

      if (
        isNetflix &&
        netflixUrl
      ) {

        providerUrl =
          netflixUrl;

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

        watch_link:
          watchLink ||
          null,

        provider_url:
          providerUrl ||
          null,

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
 * 配信サービス名整理
 * =========================================
 */

function normalizeProviderName(
  name
) {

  const value =
    String(
      name || ""
    ).trim();


  if (
    value === "Prime Video" ||
    value === "Amazon Prime Video" ||
    value === "Amazon Video"
  ) {

    return "Amazon Prime Video";

  }


  if (
    value === "Netflix"
  ) {

    return "Netflix";

  }


  if (
    value === "U-NEXT"
  ) {

    return "U-NEXT";

  }


  if (
    value === "Disney Plus" ||
    value === "Disney+"
  ) {

    return "Disney+";

  }


  if (
    value === "Hulu"
  ) {

    return "Hulu";

  }


  if (
    value === "Apple TV" ||
    value === "Apple TV Plus"
  ) {

    return "Apple TV";

  }


  if (
    value === "Google Play Movies" ||
    value === "Google Play"
  ) {

    return "Google Play Movies";

  }


  if (
    value === "FOD"
  ) {

    return "FOD";

  }


  return value;

}
