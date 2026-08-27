export default async function handler(req, res) {

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


    /* =========================================================
       詳細検索
    ========================================================= */

    const movieId = req.query.id;

    if (movieId) {

      return await getMovieDetail(
        movieId,
        apiKey,
        res
      );

    }


    /* =========================================================
       映画検索
    ========================================================= */

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
      searchData.results.length === 0
    ) {

      return res.status(404).json({
        error: "映画が見つかりませんでした"
      });

    }


    const rawMovies =
      searchData.results
        .filter(function(movie) {

          if (!movie.title) {
            return false;
          }

          return !movie.title
            .toLowerCase()
            .includes("untitled");

        })
        .slice(0, 10);


    const movies =
      rawMovies.map(function(movie) {

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


  } catch (error) {

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


/* =========================================================
   作品詳細
========================================================= */

async function getMovieDetail(
  movieId,
  apiKey,
  res
) {

  try {

    /* =======================================================
       TMDB作品詳細
    ======================================================= */

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


    /* =======================================================
       日本の配信情報
    ======================================================= */

    const providersUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "/watch/providers" +
      "?api_key=" +
      encodeURIComponent(apiKey);


    let providersData = {};


    try {

      const providersResponse =
        await fetch(providersUrl);


      if (providersResponse.ok) {

        providersData =
          await providersResponse.json();

      }

    } catch (error) {

      console.error(
        "配信情報取得エラー:",
        error
      );

    }


    const japan =
      providersData.results &&
      providersData.results.JP
        ? providersData.results.JP
        : {};


    /* =======================================================
       JustWatch
    ======================================================= */

    let justWatchInfo = null;


    try {

      justWatchInfo =
        await getJustWatchInfo(
          detailData.id,
          detailData.title,
          detailData.release_date
        );

    } catch (error) {

      console.error(
        "JustWatch情報取得エラー:",
        error
      );

    }


    /* =======================================================
       配信サービス
    ======================================================= */

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


    /* =======================================================
       字幕・吹き替え
    ======================================================= */

    const languageInfo =
      await getLanguageInfo(
        movieId,
        apiKey
      );


    /* =======================================================
       シリーズ
    ======================================================= */

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


      try {

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

      } catch (error) {

        console.error(
          "シリーズ情報取得エラー:",
          error
        );

      }

    }


    /* =======================================================
       監督
    ======================================================= */

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


    /* =======================================================
       出演者
    ======================================================= */

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


    /* =======================================================
       Netflix
    ======================================================= */

    let netflix = null;


    if (
      justWatchInfo &&
      justWatchInfo.netflix
    ) {

      netflix = {

        title_id:
          justWatchInfo.netflix.title_id || null,

        url:
          justWatchInfo.netflix.url || null

      };

    }


    /* =======================================================
       Netflix作品URL
       
       重要：
       Netflixのトップページは返さない。
       
       個別作品URLが取得できた場合だけ
       netflix_url に入れる。
    ======================================================= */

    let netflixUrl = null;


    if (
      netflix &&
      netflix.url &&
      isNetflixTitleUrl(
        netflix.url
      )
    ) {

      netflixUrl =
        netflix.url;

    }


    if (
      !netflixUrl &&
      netflix &&
      netflix.title_id
    ) {

      netflixUrl =
        "https://www.netflix.com/jp/title/" +
        encodeURIComponent(
          netflix.title_id
        );

    }


    /* =======================================================
       詳細情報を返す
    ======================================================= */

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

      netflix_url:
        netflixUrl,

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


  } catch (error) {

    console.error(
      "作品詳細エラー:",
      error
    );


    return res.status(500).json({

      error:
        "作品情報の取得中にエラーが発生しました"

    });

  }

}


/* =========================================================
   Netflix作品URL判定
========================================================= */

function isNetflixTitleUrl(url) {

  if (
    typeof url !== "string"
  ) {

    return false;

  }


  return (
    /^https?:\/\/(?:www\.)?netflix\.com\/.*\/title\/\d+/i
      .test(url)
  );

}


/* =========================================================
   字幕・吹き替え
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


  } catch (error) {

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
   JustWatch
========================================================= */

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

          country:
            "JP",

          searchQuery:
            title

        }
      );

  } catch (error) {

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


  /* =======================================================
     TMDB IDで照合
  ======================================================= */

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


  /* =======================================================
     タイトル＋公開年
  ======================================================= */

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


      if (!offer.package) {

        return;

      }


      serviceUrls.push({

        provider_name:
          offer.package.clearName || "",

        short_name:
          offer.package.shortName || "",

        url:
          offer.standardWebURL

      });

    }
  );


  /* =======================================================
     Netflix
  ======================================================= */

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
      serviceUrls

  };

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


  } finally {

    clearTimeout(timeout);

  }

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


      let providerUrl =
        null;


      /* =====================================================
         JustWatch URL
      ===================================================== */

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


          else if (
            targetName.includes("u-next") &&
            offerName.includes("u-next")
          ) {

            matchedProvider =
              true;

          }


          else if (
            targetName.includes("hulu") &&
            offerName.includes("hulu")
          ) {

            matchedProvider =
              true;

          }


          else if (
            targetName.includes("disney") &&
            offerName.includes("disney")
          ) {

            matchedProvider =
              true;

          }


          else if (
            targetName.includes("apple") &&
            offerName.includes("apple")
          ) {

            matchedProvider =
              true;

          }


          else if (
            targetName.includes("fod") &&
            offerName.includes("fod")
          ) {

            matchedProvider =
              true;

          }


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

            break;

          }

        }

      }


      /* =====================================================
         Netflix URL
      ===================================================== */

      let netflixTitleId =
        null;


      let netflixUrl =
        null;


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
         * TMDBの共通watch link
         *
         * Netflixについては
         * トップページとして使用しない。
         */

        watch_link:
          watchLink ||
          null,

        provider_url:
          providerUrl,

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
