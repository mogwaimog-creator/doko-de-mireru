export default async function handler(req, res) {

  /*
   * =========================================
   * 基本設定
   * =========================================
   */

  const CACHE_SECONDS = 60 * 60 * 24;

  const TMDB_IMAGE_BASE =
    "https://image.tmdb.org/t/p/w500";


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
     * 作品IDがある場合
     * → 作品詳細
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
     * TMDB映画検索
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
      searchData.results
        .slice(0, 10);


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
     * シリーズ作品と通常作品を分ける
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
     * シリーズ作品を公開順にする
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
     * 最終検索結果
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


    /*
     * =========================================
     * 検索結果を返す
     * =========================================
     */

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
   * 作品情報
   * creditsを同時取得
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


  /*
   * =========================================
   * 日本 JP の配信情報
   * =========================================
   */

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
   * 配信サービス整理
   * =========================================
   */

  const streaming =
    normalizeProviders(
      japan.flatrate || [],
      japan.link || null,
      justWatchInfo,
      "streaming"
    );


  const rental =
    normalizeProviders(
      japan.rent || [],
      japan.link || null,
      justWatchInfo,
      "rental"
    );


  const purchase =
    normalizeProviders(
      japan.buy || [],
      japan.link || null,
      justWatchInfo,
      "purchase"
    );


  /*
   * =========================================
   * 字幕・吹き替え情報
   * =========================================
   *
   * TMDB / JustWatchから取得できる範囲で
   * 情報を返す。
   *
   * 不明の場合は false ではなく null。
   *
   * これにより
   *
   * null = 情報なし
   * true = あり
   *
   * と区別できる。
   * =========================================
   */

  const languageInfo =
    detectLanguageInfo(
      detailData,
      justWatchInfo
    );


  /*
   * =========================================
   * シリーズ情報
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
   * 詳細情報を返す
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

    /*
     * 字幕・吹き替え
     */

    language_info:
      languageInfo,

    /*
     * 配信サービス
     */

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
      justWatchInfo
        ? justWatchInfo.netflix
        : null,

    /*
     * 配信情報ページ
     */

    link:
      japan.link || null,

    providers_updated_at:
      new Date().toISOString(),

    providers_region:
      "JP",

    providers_source:
      "TMDB / JustWatch",

    /*
     * シリーズ
     */

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
 * 字幕・吹き替え判定
 * =========================================
 */

function detectLanguageInfo(
  detailData,
  justWatchInfo
) {

  /*
   * 初期値
   *
   * null = 不明
   */

  let subtitle = null;

  let dubbing = null;


  /*
   * =========================================
   * TMDBのspoken_languagesを確認
   * =========================================
   */

  const spokenLanguages =
    Array.isArray(
      detailData &&
      detailData.spoken_languages
    )
      ? detailData.spoken_languages
      : [];


  const languageCodes =
    spokenLanguages
      .map(
        function(language) {

          return String(
            language.iso_639_1 ||
            ""
          ).toLowerCase();

        }
      );


  /*
   * 日本語音声がある作品は
   * 吹き替え候補として扱う。
   *
   * ただし日本語があるだけでは
   * 日本語吹き替え版が配信されている
   * とは断定できない。
   *
   * そのためここでは
   * dubbing = true
   * にしない。
   */


  /*
   * =========================================
   * JustWatch情報
   * =========================================
   */

  if (
    justWatchInfo &&
    justWatchInfo.languageInfo
  ) {

    if (
      typeof justWatchInfo.languageInfo.subtitle
      === "boolean"
    ) {

      subtitle =
        justWatchInfo.languageInfo.subtitle;

    }


    if (
      typeof justWatchInfo.languageInfo.dubbing
      === "boolean"
    ) {

      dubbing =
        justWatchInfo.languageInfo.dubbing;

    }

  }


  return {

    subtitle:
      subtitle,

    dubbing:
      dubbing,

    /*
     * 現時点で確実に判定できる
     * 情報だけを使う。
     */

    subtitle_text:
      subtitle === true
        ? "字幕あり"
        : subtitle === false
          ? "字幕なし"
          : null,

    dubbing_text:
      dubbing === true
        ? "吹き替えあり"
        : dubbing === false
          ? "吹き替えなし"
          : null

  };

}


/*
 * =========================================
 * JustWatchから各サービスの作品URL取得
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
          String(releaseDate)
            .substring(0, 4)
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
   * TMDB IDで照合
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


    const justWatchTmdbId =
      node.content.externalIds &&
      node.content.externalIds.tmdbId;


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


  if (!matched) {

    return null;

  }


  /*
   * =========================================
   * 各サービスURL
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

    /*
     * 字幕・吹き替え情報
     *
     * JustWatchの現在の検索結果では
     * 安全に判定できない場合が多いため
     * nullを返す。
     *
     * 後から別APIに変更する場合も
     * ここを拡張できる。
     */

    languageInfo: {

      subtitle:
        null,

      dubbing:
        null

    }

  };

}


/*
 * =========================================
 * JustWatch GraphQL実行
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
  justWatchInfo,
  type
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


      /*
       * Netflix判定
       */

      const isNetflix =
        normalizedName
          .toLowerCase()
          .includes("netflix");


      /*
       * JustWatchの直接URL
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

            matchedProvider = true;

          }


          /*
           * Amazon Prime Video
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

            matchedProvider = true;

          }


          /*
           * U-NEXT
           */

          else if (
            targetName.includes("u-next") &&
            offerName.includes("u-next")
          ) {

            matchedProvider = true;

          }


          /*
           * Hulu
           */

          else if (
            targetName.includes("hulu") &&
            offerName.includes("hulu")
          ) {

            matchedProvider = true;

          }


          /*
           * Disney+
           */

          else if (
            targetName.includes("disney") &&
            offerName.includes("disney")
          ) {

            matchedProvider = true;

          }


          /*
           * Apple TV
           */

          else if (
            targetName.includes("apple") &&
            offerName.includes("apple")
          ) {

            matchedProvider = true;

          }


          /*
           * FOD
           */

          else if (
            targetName.includes("fod") &&
            offerName.includes("fod")
          ) {

            matchedProvider = true;

          }


          /*
           * Google Play
           */

          else if (
            targetName.includes("google") &&
            offerName.includes("google")
          ) {

            matchedProvider = true;

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
          isNetflix &&
          justWatchInfo &&
          justWatchInfo.netflix
            ? justWatchInfo.netflix.title_id
            : null,

        netflix_url:
          isNetflix &&
          justWatchInfo &&
          justWatchInfo.netflix
            ? justWatchInfo.netflix.url
            : null

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
    value === "Amazon Prime Video"
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
