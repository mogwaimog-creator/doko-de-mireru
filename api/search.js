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


    /* =====================================================
       作品詳細
    ===================================================== */

    const movieId = req.query.id;

    if (movieId) {

      return await getMovieDetail(
        movieId,
        apiKey,
        res
      );

    }


    /* =====================================================
       映画検索
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
      searchData.results
        .filter(function(movie) {

          return (
            movie &&
            movie.title &&
            !String(movie.title)
              .toLowerCase()
              .includes("untitled")
          );

        })
        .slice(0, 10);


    /*
     * シリーズ情報を取得
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

            } catch (error) {

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
                movie.original_title || "",

              release_date:
                movie.release_date || "",

              overview:
                movie.overview || "",

              poster_path:
                movie.poster_path || null,

              vote_average:
                movie.vote_average || 0,

              collection:
                collection

            };

          }
        )

      );


    /*
     * シリーズをまとめる
     */

    const seriesGroups = {};

    const normalMovies = [];


    moviesWithSeries.forEach(
      function(movie) {

        if (
          !movie ||
          !movie.title
        ) {
          return;
        }


        if (movie.collection) {

          const collectionId =
            movie.collection.id;


          if (
            !seriesGroups[collectionId]
          ) {

            seriesGroups[collectionId] = [];

          }


          seriesGroups[collectionId].push(
            movie
          );

        } else {

          normalMovies.push(movie);

        }

      }
    );


    /*
     * シリーズ作品は
     * 古い作品 → 新しい作品
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
     * 通常作品も公開日の古い順ではなく、
     * TMDB検索順位を維持
     *
     * シリーズだけ先頭にまとめる
     */

    const finalMovies =
      sortedSeriesMovies
        .concat(normalMovies)
        .slice(0, 10);


    const movies =
      finalMovies.map(
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

    /* =====================================================
       TMDB作品情報
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
          detailData.release_date
        );

    } catch (error) {

      console.error(
        "JustWatch取得エラー:",
        error
      );

    }


    /* =====================================================
       配信サービス
    ===================================================== */

    const streaming =
      normalizeProviders(
        japan.flatrate || [],
        justWatchInfo
      );


    const rental =
      normalizeProviders(
        japan.rent || [],
        justWatchInfo
      );


    const purchase =
      normalizeProviders(
        japan.buy || [],
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
       Netflix情報
    ===================================================== */

    let netflix = null;


    if (
      justWatchInfo &&
      justWatchInfo.netflix
    ) {

      netflix =
        justWatchInfo.netflix;

    }


    /*
     * NetflixサービスがTMDB側に存在し、
     * JustWatchからIDが取れた場合、
     * 配信情報にもNetflix URLを追加
     */

    addNetflixDirectLinks(
      streaming,
      netflix
    );


    addNetflixDirectLinks(
      rental,
      netflix
    );


    addNetflixDirectLinks(
      purchase,
      netflix
    );


    /* =====================================================
       シリーズ
    ===================================================== */

    let collection = null;

    let seriesMovies = [];


    if (
      detailData.belongs_to_collection
    ) {

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
          Array.isArray(
            collectionData.parts
          )
        ) {

          /*
           * 年代順
           */

          seriesMovies =
            collectionData.parts

              .filter(
                function(item) {

                  return (
                    item &&
                    item.title &&
                    !String(item.title)
                      .toLowerCase()
                      .includes("untitled")
                  );

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
                      item.release_date || "",

                    poster_path:
                      item.poster_path || null

                  };

                }
              );

        }

      }

    }


    /* =====================================================
       監督
    ===================================================== */

    let director = null;


    if (
      detailData.credits &&
      Array.isArray(
        detailData.credits.crew
      )
    ) {

      director =
        detailData.credits.crew.find(
          function(person) {

            return (
              person &&
              person.job === "Director"
            );

          }
        ) || null;

    }


    /* =====================================================
       出演者
    ===================================================== */

    let cast = [];


    if (
      detailData.credits &&
      Array.isArray(
        detailData.credits.cast
      )
    ) {

      cast =
        detailData.credits.cast
          .slice(0, 8)
          .map(
            function(person) {

              return {

                name:
                  person.name || "",

                character:
                  person.character || ""

              };

            }
          );

    }


    /* =====================================================
       TMDBリンク
    ===================================================== */

    const tmdbLink =
      japan.link ||
      null;


    /* =====================================================
       最終レスポンス
    ===================================================== */

    return res.status(200).json({

      id:
        detailData.id,

      title:
        detailData.title || "",

      original_title:
        detailData.original_title || "",

      release_date:
        detailData.release_date || "",

      overview:
        detailData.overview || "",

      poster_path:
        detailData.poster_path || null,

      vote_average:
        detailData.vote_average || 0,

      genres:
        Array.isArray(detailData.genres)
          ? detailData.genres
          : [],

      director:
        director
          ? {
              name:
                director.name || ""
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
        tmdbLink,

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
                collection.name || "",

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
   Netflix直接リンクを追加
========================================================= */

function addNetflixDirectLinks(
  providers,
  netflix
) {

  if (
    !Array.isArray(providers)
  ) {

    return;

  }


  if (
    !netflix ||
    !netflix.title_id
  ) {

    return;

  }


  const directUrl =
    "https://www.netflix.com/jp/title/" +
    encodeURIComponent(
      String(netflix.title_id)
    );


  providers.forEach(
    function(provider) {

      if (
        !provider
      ) {
        return;
      }


      const name =
        String(
          provider.provider_name || ""
        ).toLowerCase();


      if (
        name.includes("netflix")
      ) {

        provider.netflix_title_id =
          String(netflix.title_id);


        provider.netflix_url =
          directUrl;


        provider.watch_link =
          directUrl;


        provider.provider_url =
          directUrl;

      }

    }
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


  /* =====================================================
     TMDB IDで照合
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

      matched =
        node;

      break;

    }

  }


  /* =====================================================
     タイトル＋年で照合
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


  /* =====================================================
     Offers
  ===================================================== */

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


      const providerName =
        offer.package.clearName ||
        "";


      if (!providerName) {

        return;

      }


      serviceUrls.push({

        provider_name:
          providerName,

        short_name:
          offer.package.shortName || "",

        url:
          offer.standardWebURL

      });

    }
  );


  /* =====================================================
     Netflix
  ===================================================== */

  let netflix = null;


  for (
    let i = 0;
    i < serviceUrls.length;
    i++
  ) {

    const item =
      serviceUrls[i];


    if (
      !item
    ) {
      continue;
    }


    const providerName =
      String(
        item.provider_name || ""
      );


    const shortName =
      String(
        item.short_name || ""
      );


    if (
      /netflix/i.test(
        providerName
      ) ||
      shortName.toLowerCase() ===
      "nfx"
    ) {

      const titleId =
        extractNetflixTitleId(
          item.url
        );


      if (titleId) {

        netflix = {

          title_id:
            titleId,

          url:
            "https://www.netflix.com/jp/title/" +
            titleId

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
   Netflix作品ID抽出
========================================================= */

function extractNetflixTitleId(
  url
) {

  if (
    typeof url !== "string"
  ) {

    return null;

  }


  const patterns = [

    /netflix\.com\/(?:jp\/)?title\/(\d+)/i,

    /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i,

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
        !provider
      ) {

        return;

      }


      const providerId =
        provider.provider_id;


      const providerName =
        provider.provider_name ||
        "";


      if (
        !providerId ||
        !providerName
      ) {

        return;

      }


      const key =
        String(providerId);


      if (
        !unique.has(key)
      ) {

        unique.set(
          key,
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


      return (
        priorityA -
        priorityB
      );

    }
  );


  return result.map(
    function(provider) {

      const originalName =
        provider.provider_name ||
        "配信サービス";


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


      /*
       * JustWatchの作品URL
       */

      if (
        justWatchInfo &&
        Array.isArray(
          justWatchInfo.offers
        )
      ) {

        const targetName =
          normalizedName.toLowerCase();


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


          let matched =
            false;


          if (
            targetName.includes("netflix") &&
            offerName.includes("netflix")
          ) {

            matched = true;

          }

          else if (
            (
              targetName.includes("amazon") ||
              targetName.includes("prime")
            ) &&
            (
              offerName.includes("amazon") ||
              offerName.includes("prime")
            )
          ) {

            matched = true;

          }

          else if (
            targetName.includes("u-next") &&
            offerName.includes("u-next")
          ) {

            matched = true;

          }

          else if (
            targetName.includes("hulu") &&
            offerName.includes("hulu")
          ) {

            matched = true;

          }

          else if (
            targetName.includes("disney") &&
            offerName.includes("disney")
          ) {

            matched = true;

          }

          else if (
            targetName.includes("apple") &&
            offerName.includes("apple")
          ) {

            matched = true;

          }

          else if (
            targetName.includes("fod") &&
            offerName.includes("fod")
          ) {

            matched = true;

          }

          else if (
            targetName.includes("google") &&
            offerName.includes("google")
          ) {

            matched = true;

          }


          if (matched) {

            providerUrl =
              offer.url;

            break;

          }

        }

      }


      let netflixTitleId =
        null;


      let netflixUrl =
        null;


      /*
       * Netflix URLからID取得
       */

      if (isNetflix) {

        netflixTitleId =
          extractNetflixTitleId(
            providerUrl
          );


        if (netflixTitleId) {

          netflixUrl =
            "https://www.netflix.com/jp/title/" +
            netflixTitleId;

        }


        /*
         * JustWatchのNetflix情報
         */

        if (
          !netflixTitleId &&
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

      }


      /*
       * Netflixの場合は
       * 作品URLを最優先
       */

      let watchLink =
        providerUrl;


      if (
        isNetflix &&
        netflixUrl
      ) {

        watchLink =
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
          watchLink,

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
   サービス名統一
========================================================= */

function normalizeProviderName(
  name
) {

  const value =
    String(
      name || ""
    ).trim();


  if (
    /netflix/i.test(value)
  ) {

    return "Netflix";

  }


  if (
    /prime video/i.test(value) ||
    /amazon prime/i.test(value) ||
    value === "Prime Video"
  ) {

    return "Amazon Prime Video";

  }


  if (
    /u-next/i.test(value)
  ) {

    return "U-NEXT";

  }


  if (
    /hulu/i.test(value)
  ) {

    return "Hulu";

  }


  if (
    /disney/i.test(value)
  ) {

    return "Disney+";

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


  return value ||
    "配信サービス";

}
