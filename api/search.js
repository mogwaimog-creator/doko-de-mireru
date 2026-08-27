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

    const movieId = req.query.id;

    /* =====================================================
       作品詳細
    ===================================================== */

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

    /* =====================================================
       最大20作品
    ===================================================== */

    const rawMovies =
      searchData.results
        .filter(function(movie) {

          return (
            movie &&
            movie.id &&
            movie.title &&
            !String(movie.title)
              .toLowerCase()
              .includes("untitled")
          );

        })
        .slice(0, 20);

    /* =====================================================
       シリーズ情報取得
    ===================================================== */

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
                movie.original_title,

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

    /* =====================================================
       シリーズをまとめる
    ===================================================== */

    const seriesGroups = {};
    const normalMovies = [];

    moviesWithSeries.forEach(
      function(movie) {

        if (
          !movie.title ||
          String(movie.title)
            .toLowerCase()
            .includes("untitled")
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

    /* =====================================================
       シリーズ作品を年代順
    ===================================================== */

    let sortedSeriesMovies = [];

    Object.keys(seriesGroups).forEach(
      function(collectionId) {

        const group =
          seriesGroups[collectionId];

        group.sort(
          function(a, b) {

            return (
              getReleaseYear(
                a.release_date
              ) -
              getReleaseYear(
                b.release_date
              )
            );

          }
        );

        sortedSeriesMovies =
          sortedSeriesMovies.concat(
            group
          );

      }
    );

    /* =====================================================
       通常作品も年代順
    ===================================================== */

    normalMovies.sort(
      function(a, b) {

        return (
          getReleaseYear(
            a.release_date
          ) -
          getReleaseYear(
            b.release_date
          )
        );

      }
    );

    /* =====================================================
       最終結果
    ===================================================== */

    const finalMovies =
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
        finalMovies

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
   年を取得
========================================================= */

function getReleaseYear(date) {

  if (!date) {
    return 9999;
  }

  const year =
    parseInt(
      String(date).substring(0, 4),
      10
    );

  if (Number.isNaN(year)) {
    return 9999;
  }

  return year;

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
     TMDB詳細
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

  let providersData = {};

  try {

    const providersUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "/watch/providers" +
      "?api_key=" +
      encodeURIComponent(apiKey);

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

    try {

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

                  return (
                    item &&
                    item.id &&
                    item.title &&
                    !String(item.title)
                      .toLowerCase()
                      .includes("untitled")
                  );

                }
              )

              .sort(
                function(a, b) {

                  return (
                    getReleaseYear(
                      a.release_date
                    ) -
                    getReleaseYear(
                      b.release_date
                    )
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

    } catch (error) {

      console.error(
        "シリーズ取得エラー:",
        error
      );

    }

  }

  /* =====================================================
     監督
  ===================================================== */

  let director = null;

  if (
    detailData.credits &&
    Array.isArray(detailData.credits.crew)
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
    Array.isArray(detailData.credits.cast)
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
                person.character || ""

            };

          }
        );

  }

  /* =====================================================
     Netflix情報
  ===================================================== */

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

  /* =====================================================
     Netflix URLが取得できた場合、
     title IDから確実な作品URLも作成
  ===================================================== */

  if (
    netflix &&
    netflix.title_id
  ) {

    netflix.url =
      "https://www.netflix.com/title/" +
      netflix.title_id;

  }

  /* =====================================================
     詳細JSON
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
     TMDB ID一致
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
     タイトル＋公開年
  ===================================================== */

  if (!matched) {

    const year =
      releaseDate
        ? Number(
            String(releaseDate)
              .substring(0, 4)
          )
        : null;

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
     オファー
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

      const shortName =
        offer.package.shortName ||
        "";

      const url =
        offer.standardWebURL;

      serviceUrls.push({

        provider_name:
          providerName,

        short_name:
          shortName,

        url:
          url

      });

    }
  );

  /* =====================================================
     Netflix作品URL
  ===================================================== */

  let netflix = null;

  for (
    let i = 0;
    i < serviceUrls.length;
    i++
  ) {

    const item =
      serviceUrls[i];

    if (!item) {
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

    const isNetflix =
      /netflix/i.test(
        providerName
      ) ||
      shortName.toLowerCase() ===
        "nfx";

    if (!isNetflix) {
      continue;
    }

    /* =================================================
       Netflix URLから作品ID取得
    ================================================= */

    const netflixTitleId =
      extractNetflixTitleId(
        item.url
      );

    if (netflixTitleId) {

      netflix = {

        title_id:
          netflixTitleId,

        url:
          "https://www.netflix.com/title/" +
          netflixTitleId

      };

      break;

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
   Netflix作品ID取得
========================================================= */

function extractNetflixTitleId(
  url
) {

  if (
    typeof url !== "string" ||
    !url
  ) {

    return null;

  }

  /*
   * 例:
   *
   * https://www.netflix.com/title/81234567
   *
   * https://www.netflix.com/jp/title/81234567
   *
   * https://www.netflix.com/watch/81234567
   *
   */

  const titleMatch =
    url.match(
      /netflix\.com\/(?:[^/]+\/)?title\/(\d+)/i
    );

  if (titleMatch) {

    return titleMatch[1];

  }

  const watchMatch =
    url.match(
      /netflix\.com\/(?:[^/]+\/)?watch\/(\d+)/i
    );

  if (watchMatch) {

    return watchMatch[1];

  }

  /*
   * URL内にtitle/数字がある場合
   */

  const generalMatch =
    url.match(
      /title\/(\d+)/i
    );

  if (generalMatch) {

    return generalMatch[1];

  }

  return null;

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

      /* =================================================
         JustWatchサービスURL
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
            targetName.includes(
              "netflix"
            ) &&
            (
              offerName.includes(
                "netflix"
              ) ||
              shortName === "nfx"
            )
          ) {

            matchedProvider = true;

          }

          /* Amazon Prime */

          else if (
            (
              targetName.includes(
                "prime"
              ) ||
              targetName.includes(
                "amazon"
              )
            ) &&
            (
              offerName.includes(
                "amazon"
              ) ||
              offerName.includes(
                "prime"
              )
            )
          ) {

            matchedProvider = true;

          }

          /* U-NEXT */

          else if (
            targetName.includes(
              "u-next"
            ) &&
            offerName.includes(
              "u-next"
            )
          ) {

            matchedProvider = true;

          }

          /* Hulu */

          else if (
            targetName.includes(
              "hulu"
            ) &&
            offerName.includes(
              "hulu"
            )
          ) {

            matchedProvider = true;

          }

          /* Disney+ */

          else if (
            targetName.includes(
              "disney"
            ) &&
            offerName.includes(
              "disney"
            )
          ) {

            matchedProvider = true;

          }

          /* Apple TV */

          else if (
            targetName.includes(
              "apple"
            ) &&
            offerName.includes(
              "apple"
            )
          ) {

            matchedProvider = true;

          }

          /* FOD */

          else if (
            targetName.includes(
              "fod"
            ) &&
            offerName.includes(
              "fod"
            )
          ) {

            matchedProvider = true;

          }

          /* Google Play */

          else if (
            targetName.includes(
              "google"
            ) &&
            offerName.includes(
              "google"
            )
          ) {

            matchedProvider = true;

          }

          if (matchedProvider) {

            providerUrl =
              offer.url;

            break;

          }

        }

      }

      /* =================================================
         Netflix作品ID
      ================================================= */

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

        if (netflixTitleId) {

          /*
           * ここでNetflix作品ページを直接作成
           */

          netflixUrl =
            "https://www.netflix.com/title/" +
            netflixTitleId;

          /*
           * provider_urlもNetflix作品ページにする
           */

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
          provider.display_priority ?? 9999,

        /*
         * TMDBの一般リンク
         */

        watch_link:
          watchLink ||
          null,

        /*
         * JustWatchの各サービスURL
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
   サービス名統一
========================================================= */

function normalizeProviderName(
  name
) {

  const value =
    String(
      name || ""
    ).trim();

  /* Netflix */

  if (
    /netflix/i.test(value)
  ) {

    return "Netflix";

  }

  /* Amazon Prime Video */

  if (
    /amazon/i.test(value) ||
    /prime video/i.test(value)
  ) {

    return "Amazon Prime Video";

  }

  /* U-NEXT */

  if (
    /u-next/i.test(value)
  ) {

    return "U-NEXT";

  }

  /* Disney+ */

  if (
    /disney/i.test(value)
  ) {

    return "Disney+";

  }

  /* Hulu */

  if (
    /hulu/i.test(value)
  ) {

    return "Hulu";

  }

  /* Apple TV */

  if (
    /apple tv/i.test(value)
  ) {

    return "Apple TV";

  }

  /* Google Play */

  if (
    /google play/i.test(value)
  ) {

    return "Google Play Movies";

  }

  /* FOD */

  if (
    /^fod$/i.test(value)
  ) {

    return "FOD";

  }

  return value;

}
