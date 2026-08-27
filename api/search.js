export default async function handler(req, res) {

  const CACHE_SECONDS = 60 * 60 * 24;

  try {

    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "TMDB APIキーが設定されていません"
      });
    }

    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=3600"
    );

    const movieId = req.query.id;

    /* =====================================================
       詳細
    ===================================================== */

    if (movieId) {

      return await getMovieDetail(
        movieId,
        apiKey,
        res
      );

    }

    /* =====================================================
       検索
    ===================================================== */

    const query = req.query.query;

    if (!query) {

      return res.status(400).json({
        error: "映画名を入力してください"
      });

    }

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
        error: "映画が見つかりませんでした"
      });

    }

    const rawMovies =
      searchData.results.slice(0, 10);

    const movies =
      rawMovies
        .filter(function(movie) {

          if (!movie.title) {
            return false;
          }

          return !movie.title
            .toLowerCase()
            .includes("untitled");

        })
        .map(function(movie) {

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
              movie.vote_average

          };

        });

    return res.status(200).json({
      results: movies
    });

  }

  catch (error) {

    console.error(
      "検索エラー:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "検索中にエラーが発生しました"
    });

  }

}


/* =========================================================
   作品詳細
========================================================= */

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

  /* =====================================================
     TMDB作品詳細
  ===================================================== */

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


  /* =====================================================
     日本の配信情報
  ===================================================== */

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


  /* =====================================================
     JustWatch
  ===================================================== */

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


  /* =====================================================
     配信サービス
  ===================================================== */

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


  /* =====================================================
     字幕・吹き替え
  ===================================================== */

  const languageInfo =
    await getLanguageInfo(
      movieId,
      apiKey
    );


  /* =====================================================
     シリーズ
  ===================================================== */

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

            .filter(function(item) {

              if (!item.title) {
                return false;
              }

              return !item.title
                .toLowerCase()
                .includes("untitled");

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

            })

            .map(function(item) {

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

            });

      }

    }

  }


  /* =====================================================
     監督
  ===================================================== */

  let director = null;

  if (
    detailData.credits &&
    detailData.credits.crew
  ) {

    director =
      detailData.credits.crew.find(
        function(person) {

          return person.job === "Director";

        }
      ) || null;

  }


  /* =====================================================
     出演者
  ===================================================== */

  let cast = [];

  if (
    detailData.credits &&
    detailData.credits.cast
  ) {

    cast =
      detailData.credits.cast
        .slice(0, 8)
        .map(function(person) {

          return {

            name:
              person.name,

            character:
              person.character

          };

        });

  }


  /* =====================================================
     Netflix
  ===================================================== */

  const netflix =
    justWatchInfo &&
    justWatchInfo.netflix
      ? justWatchInfo.netflix
      : null;


  /* =====================================================
     詳細情報
  ===================================================== */

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

    netflix:
      netflix,

    language:
      languageInfo,

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


/* =========================================================
   字幕・吹き替え情報
========================================================= */

async function getLanguageInfo(
  movieId,
  apiKey
) {

  try {

    const url =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP";

    const response =
      await fetch(url);

    if (!response.ok) {

      return {

        original_language:
          null,

        subtitle:
          null,

        dubbing:
          null

      };

    }

    const data =
      await response.json();

    return {

      original_language:
        data.original_language || null,

      subtitle:
        null,

      dubbing:
        null

    };

  }

  catch (error) {

    console.error(
      "言語情報取得エラー:",
      error
    );

    return {

      original_language:
        null,

      subtitle:
        null,

      dubbing:
        null

    };

  }

}


/* =========================================================
   JustWatch情報取得
========================================================= */

async function getJustWatchInfo(
  tmdbId,
  title,
  originalTitle,
  releaseDate
) {

  const endpoint =
    "https://apis.justwatch.com/graphql";


  /* =====================================================
     検索
  ===================================================== */

  const searchQuery = `

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


  let searchData = null;


  try {

    searchData =
      await justWatchGraphQL(
        endpoint,
        searchQuery,
        {

          country:
            "JP",

          searchQuery:
            title

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
    searchData &&
    searchData.data &&
    searchData.data.popularTitles &&
    Array.isArray(
      searchData.data.popularTitles.edges
    )
      ? searchData.data.popularTitles.edges
      : [];


  let matched = null;


  /* =====================================================
     ① TMDB ID一致
  ===================================================== */

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

      matched = node;

      break;

    }

  }


  /* =====================================================
     ② 日本語タイトル＋年
  ===================================================== */

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


      const sameOriginalTitle =
        originalTitle &&
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
        (
          sameTitle ||
          sameOriginalTitle
        ) &&
        sameYear
      ) {

        matched = node;

        break;

      }

    }

  }


  /* =====================================================
     ③ タイトルだけで照合
  ===================================================== */

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


      const titleA =
        normalizeTitle(
          content.title
        );

      const titleB =
        normalizeTitle(
          title
        );

      const titleC =
        normalizeTitle(
          originalTitle
        );


      if (
        titleA === titleB ||
        (
          titleC &&
          titleA === titleC
        )
      ) {

        matched = node;

        break;

      }

    }

  }


  if (!matched) {

    console.log(
      "JustWatch作品が見つかりません:",
      title
    );

    return null;

  }


  /* =====================================================
     fullPath
  ===================================================== */

  const fullPath =
    matched.content &&
    matched.content.fullPath
      ? matched.content.fullPath
      : null;


  if (!fullPath) {

    console.log(
      "JustWatch fullPathなし:",
      title
    );

    return null;

  }


  /* =====================================================
     作品ページから配信URLを取得
  ===================================================== */

  const offers =
    await getJustWatchOffers(
      endpoint,
      fullPath
    );


  /* =====================================================
     Netflix
  ===================================================== */

  let netflix = null;


  for (
    let i = 0;
    i < offers.length;
    i++
  ) {

    const offer =
      offers[i];


    if (!offer) {
      continue;
    }


    const providerName =
      offer.provider_name || "";


    const shortName =
      offer.short_name || "";


    if (
      /netflix/i.test(
        providerName
      ) ||
      /^nfx$/i.test(
        shortName
      )
    ) {

      const url =
        cleanNetflixUrl(
          offer.url
        );


      if (url) {

        const titleId =
          extractNetflixTitleId(
            url
          );


        netflix = {

          title_id:
            titleId,

          url:
            url

        };


        /*
         * ここで確実に終了。
         *
         * Netflixのトップページは
         * 絶対に設定しない。
         */

        break;

      }

    }

  }


  return {

    netflix:
      netflix,

    offers:
      offers

  };

}


/* =========================================================
   JustWatch作品ページのOffers取得
========================================================= */

async function getJustWatchOffers(
  endpoint,
  fullPath
) {

  const query = `

    query GetTitleDetails(
      $country: Country!,
      $language: Language!,
      $fullPath: String!
    ) {

      urlV2(
        fullPath: $fullPath
      ) {

        node {

          content(
            country: $country,
            language: $language
          ) {

            title

            fullPath

          }

          offers(
            country: $country,
            platform: WEB
          ) {

            monetizationType

            presentationType

            standardWebURL

            package {

              clearName

              shortName

            }

          }

        }

      }

    }

  `;


  try {

    const data =
      await justWatchGraphQL(
        endpoint,
        query,
        {

          country:
            "JP",

          language:
            "ja",

          fullPath:
            fullPath

        }
      );


    const node =
      data &&
      data.data &&
      data.data.urlV2 &&
      data.data.urlV2.node
        ? data.data.urlV2.node
        : null;


    if (!node) {

      return [];

    }


    const rawOffers =
      Array.isArray(
        node.offers
      )
        ? node.offers
        : [];


    return rawOffers
      .filter(function(offer) {

        return (
          offer &&
          typeof offer.standardWebURL ===
            "string" &&
          offer.package
        );

      })
      .map(function(offer) {

        return {

          provider_name:
            offer.package.clearName || "",

          short_name:
            offer.package.shortName || "",

          url:
            offer.standardWebURL,

          monetization_type:
            offer.monetizationType || null,

          presentation_type:
            offer.presentationType || null

        };

      });


  }

  catch (error) {

    console.error(
      "JustWatch作品情報取得失敗:",
      error
    );

    return [];

  }

}


/* =========================================================
   JustWatch GraphQL
========================================================= */

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

      console.error(
        "JustWatch GraphQL:",
        json.errors
      );


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


/* =========================================================
   Netflix URLを安全にする
========================================================= */

function cleanNetflixUrl(
  url
) {

  if (
    typeof url !== "string"
  ) {

    return null;

  }


  const value =
    url.trim();


  if (!value) {

    return null;

  }


  /*
   * Netflix以外は拒否
   */

  if (
    !/^https?:\/\/(www\.)?netflix\.com\//i
      .test(value)
  ) {

    return null;

  }


  /*
   * Netflix作品ページだけ許可
   *
   * 例:
   * https://www.netflix.com/title/81776693
   *
   * https://www.netflix.com/jp/title/81776693
   */

  const match =
    value.match(
      /https?:\/\/(www\.)?netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i
    );


  if (!match) {

    return null;

  }


  const titleId =
    match[2];


  /*
   * 日本版Netflixの作品ページを作る
   */

  return (
    "https://www.netflix.com/jp/title/" +
    encodeURIComponent(titleId)
  );

}


/* =========================================================
   Netflix作品ID
========================================================= */

function extractNetflixTitleId(
  url
) {

  if (
    typeof url !== "string"
  ) {

    return null;

  }


  const match =
    url.match(
      /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i
    );


  if (!match) {

    return null;

  }


  return match[1];

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
      /[\s　「」『』・:：!！?？,.，．'’"“”()（）【】\[\]{}]/g,
      ""
    );

}


/* =========================================================
   配信サービス整理
========================================================= */

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


      let providerUrl = null;


      let netflixTitleId =
        null;


      let netflixUrl =
        null;


      /* =================================================
         JustWatchのURLを探す
      ================================================= */

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


          /* Netflix */

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


          /* Amazon */

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


          /* U-NEXT */

          else if (
            targetName.includes("u-next") &&
            offerName.includes("u-next")
          ) {

            matchedProvider =
              true;

          }


          /* Hulu */

          else if (
            targetName.includes("hulu") &&
            offerName.includes("hulu")
          ) {

            matchedProvider =
              true;

          }


          /* Disney */

          else if (
            targetName.includes("disney") &&
            offerName.includes("disney")
          ) {

            matchedProvider =
              true;

          }


          /* Apple */

          else if (
            targetName.includes("apple") &&
            offerName.includes("apple")
          ) {

            matchedProvider =
              true;

          }


          /* FOD */

          else if (
            targetName.includes("fod") &&
            offerName.includes("fod")
          ) {

            matchedProvider =
              true;

          }


          /* Google */

          else if (
            targetName.includes("google") &&
            offerName.includes("google")
          ) {

            matchedProvider =
              true;

          }


          if (matchedProvider) {

            providerUrl =
              offer.url;


            if (isNetflix) {

              const cleanUrl =
                cleanNetflixUrl(
                  offer.url
                );


              if (cleanUrl) {

                netflixUrl =
                  cleanUrl;


                netflixTitleId =
                  extractNetflixTitleId(
                    cleanUrl
                  );

              }

            }


            break;

          }

        }

      }


      /*
       * Netflixの場合、
       * 不正なURLを絶対に返さない。
       */

      if (isNetflix) {

        if (
          !netflixUrl
        ) {

          providerUrl =
            null;

        }

        else {

          providerUrl =
            netflixUrl;

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

        /*
         * TMDBのwatch link
         */

        watch_link:
          watchLink ||
          null,

        /*
         * JustWatchの直接URL
         */

        provider_url:
          providerUrl,

        /*
         * Netflix専用
         */

        netflix_title_id:
          netflixTitleId,

        netflix_url:
          netflixUrl

      };

    }
  );

}


/* =========================================================
   サービス名
========================================================= */

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
    /netflix/i.test(value)
  ) {

    return "Netflix";

  }


  if (
    /u-next/i.test(value)
  ) {

    return "U-NEXT";

  }


  if (
    /disney/i.test(value)
  ) {

    return "Disney+";

  }


  if (
    /hulu/i.test(value)
  ) {

    return "Hulu";

  }


  if (
    /apple tv/i.test(value)
  ) {

    return "Apple TV";

  }


  if (
    /google play/i.test(value)
  ) {

    return "Google Play Movies";

  }


  if (
    /^fod$/i.test(value)
  ) {

    return "FOD";

  }


  return value;

}
