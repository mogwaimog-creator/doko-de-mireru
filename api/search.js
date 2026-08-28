```javascript
const NETFLIX_TITLE_IDS = {
  "519182": "81776693"
};

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({
      error: "GETメソッドのみ利用できます。"
    });
  }

  try {
    const apiKey = process.env.TMDB_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "TMDB_API_KEY が設定されていません。"
      });
    }

    const query =
      req.query &&
      typeof req.query.query === "string"
        ? req.query.query.trim()
        : "";

    const id =
      req.query &&
      typeof req.query.id === "string"
        ? req.query.id.trim()
        : "";

    if (id) {
      const movie = await getMovieDetail(id, apiKey);
      return res.status(200).json(movie);
    }

    if (!query) {
      return res.status(400).json({
        error: "映画名を入力してください。"
      });
    }

    const searchUrl =
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" + encodeURIComponent(apiKey) +
      "&language=ja-JP" +
      "&region=JP" +
      "&include_adult=false" +
      "&page=1" +
      "&query=" + encodeURIComponent(query);

    const data = await fetchJson(searchUrl);

    let movies = Array.isArray(data.results)
      ? data.results
      : [];

    movies = movies.filter(function(movie) {
      return movie && movie.id && movie.title;
    });

    const normalizedQuery = normalizeTitle(query);

    movies.sort(function(a, b) {
      const aTitle = normalizeTitle(a.title || "");
      const bTitle = normalizeTitle(b.title || "");

      const aExact = aTitle === normalizedQuery ? 0 : 1;
      const bExact = bTitle === normalizedQuery ? 0 : 1;

      if (aExact !== bExact) {
        return aExact - bExact;
      }

      return (
        Number(b.vote_average || 0) -
        Number(a.vote_average || 0)
      );
    });

    movies = movies.slice(0, 10);

    const results = movies.map(function(movie) {
      return {
        id: movie.id,
        title: movie.title || "",
        original_title: movie.original_title || "",
        release_date: movie.release_date || "",
        poster_path: movie.poster_path || null,
        overview: movie.overview || "",
        vote_average: Number(movie.vote_average || 0)
      };
    });

    return res.status(200).json({
      results: results
    });

  } catch (error) {
    console.error("SEARCH API ERROR:", error);

    return res.status(500).json({
      error:
        error && error.message
          ? error.message
          : "サーバーでエラーが発生しました。"
    });
  }
};


async function getMovieDetail(movieId, apiKey) {
  const movieUrl =
    "https://api.themoviedb.org/3/movie/" +
    encodeURIComponent(movieId) +
    "?api_key=" + encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&append_to_response=credits";

  const movie = await fetchJson(movieUrl);

  let providersJP = {};

  try {
    const providerUrl =
      "https://api.themoviedb.org/3/movie/" +
      encodeURIComponent(movieId) +
      "/watch/providers" +
      "?api_key=" + encodeURIComponent(apiKey);

    const providerData = await fetchJson(providerUrl);

    if (
      providerData &&
      providerData.results &&
      providerData.results.JP
    ) {
      providersJP = providerData.results.JP;
    }

  } catch (error) {
    console.error("WATCH PROVIDERS ERROR:", error);
    providersJP = {};
  }

  const streaming = normalizeProviders(
    providersJP.flatrate
  );

  const rental = normalizeProviders(
    providersJP.rent
  );

  const purchase = normalizeProviders(
    providersJP.buy
  );

  const title =
    movie.title ||
    movie.original_title ||
    "";

  const netflixProvider = findProvider(
    streaming,
    rental,
    purchase,
    ["netflix"]
  );

  const amazonProvider = findProvider(
    streaming,
    rental,
    purchase,
    ["amazon", "prime video"]
  );

  const unextProvider = findProvider(
    streaming,
    rental,
    purchase,
    ["u-next", "unext"]
  );

  const huluProvider = findProvider(
    streaming,
    rental,
    purchase,
    ["hulu"]
  );

  const disneyProvider = findProvider(
    streaming,
    rental,
    purchase,
    ["disney"]
  );

  const appleProvider = findProvider(
    streaming,
    rental,
    purchase,
    ["apple"]
  );

  const netflixTitleId = getNetflixTitleId(movie.id);

  const netflixUrl = netflixProvider
    ? createNetflixUrl(netflixTitleId)
    : null;

  const amazonUrl = amazonProvider
    ? createAmazonUrl(amazonProvider, title)
    : null;

  const unextUrl = unextProvider
    ? createUnextUrl()
    : null;

  const huluUrl = huluProvider
    ? createHuluUrl(title)
    : null;

  const disneyUrl = disneyProvider
    ? createDisneyUrl(title)
    : null;

  const appleUrl = appleProvider
    ? createAppleUrl(title)
    : null;

  const director = getDirector(movie);

  const cast = getCast(movie);

  let series = null;

  if (
    movie.belongs_to_collection &&
    movie.belongs_to_collection.id
  ) {
    series = await getCollection(
      movie.belongs_to_collection.id,
      apiKey
    );
  }

  const tmdbWatchLink =
    providersJP.link ||
    "https://www.themoviedb.org/movie/" +
    movie.id +
    "/watch?locale=JP";

  return {
    id: movie.id,

    title: movie.title || "",

    original_title:
      movie.original_title || "",

    release_date:
      movie.release_date || "",

    poster_path:
      movie.poster_path || null,

    overview:
      movie.overview || "",

    vote_average:
      Number(movie.vote_average || 0),

    original_language:
      movie.original_language || "",

    genres:
      Array.isArray(movie.genres)
        ? movie.genres
        : [],

    director: director,

    cast: cast,

    streaming: streaming,

    rental: rental,

    purchase: purchase,

    netflix:
      netflixProvider
        ? {
            url: netflixUrl,
            direct: Boolean(netflixTitleId),
            title_id: netflixTitleId
          }
        : null,

    netflix_url: netflixUrl,

    netflix_title_id:
      netflixTitleId,

    netflix_id:
      netflixTitleId,

    amazon:
      amazonProvider
        ? {
            url: amazonUrl
          }
        : null,

    amazon_url: amazonUrl,

    unext_url: unextUrl,

    hulu_url: huluUrl,

    disney_url: disneyUrl,

    apple_tv_url: appleUrl,

    series: series,

    link: tmdbWatchLink
  };
}


function createNetflixUrl(netflixTitleId) {
  if (
    netflixTitleId &&
    /^[0-9]+$/.test(String(netflixTitleId))
  ) {
    return (
      "https://www.netflix.com/jp/title/" +
      encodeURIComponent(netflixTitleId)
    );
  }

  return "https://www.netflix.com/jp/";
}


function getNetflixTitleId(movieId) {
  const key = String(movieId);

  if (
    Object.prototype.hasOwnProperty.call(
      NETFLIX_TITLE_IDS,
      key
    )
  ) {
    return NETFLIX_TITLE_IDS[key];
  }

  return null;
}


function createAmazonUrl(provider, title) {
  if (
    provider &&
    typeof provider.provider_url === "string" &&
    /^https?:\/\//i.test(provider.provider_url) &&
    /amazon\./i.test(provider.provider_url)
  ) {
    return provider.provider_url;
  }

  return (
    "https://www.amazon.co.jp/s" +
    "?k=" +
    encodeURIComponent(title) +
    "&i=instant-video"
  );
}


function createUnextUrl() {
  return "https://video.unext.jp/";
}


function createHuluUrl(title) {
  return (
    "https://www.hulu.jp/search?q=" +
    encodeURIComponent(title)
  );
}


function createDisneyUrl(title) {
  return (
    "https://www.disneyplus.com/ja-jp/search/" +
    encodeURIComponent(title)
  );
}


function createAppleUrl(title) {
  return (
    "https://tv.apple.com/jp/search?term=" +
    encodeURIComponent(title)
  );
}


function normalizeProviders(providers) {
  if (!Array.isArray(providers)) {
    return [];
  }

  return providers
    .filter(function(provider) {
      return (
        provider &&
        provider.provider_name
      );
    })
    .map(function(provider) {
      return {
        provider_id:
          provider.provider_id || null,

        provider_name:
          provider.provider_name || "",

        logo_path:
          provider.logo_path || null,

        provider_url:
          provider.provider_url || null
      };
    });
}


function findProvider(
  streaming,
  rental,
  purchase,
  keywords
) {
  const all = []
    .concat(streaming || [])
    .concat(rental || [])
    .concat(purchase || []);

  for (let i = 0; i < all.length; i++) {
    const provider = all[i];

    const name = String(
      provider.provider_name || ""
    ).toLowerCase();

    for (let j = 0; j < keywords.length; j++) {
      if (
        name.includes(
          keywords[j].toLowerCase()
        )
      ) {
        return provider;
      }
    }
  }

  return null;
}


function getDirector(movie) {
  const crew =
    movie &&
    movie.credits &&
    Array.isArray(movie.credits.crew)
      ? movie.credits.crew
      : [];

  for (let i = 0; i < crew.length; i++) {
    if (
      crew[i] &&
      crew[i].job === "Director"
    ) {
      return {
        id: crew[i].id || null,
        name: crew[i].name || ""
      };
    }
  }

  return null;
}


function getCast(movie) {
  const cast =
    movie &&
    movie.credits &&
    Array.isArray(movie.credits.cast)
      ? movie.credits.cast
      : [];

  return cast
    .slice(0, 8)
    .map(function(person) {
      return {
        id: person.id || null,
        name: person.name || ""
      };
    });
}


async function getCollection(
  collectionId,
  apiKey
) {
  try {
    const url =
      "https://api.themoviedb.org/3/collection/" +
      encodeURIComponent(collectionId) +
      "?api_key=" +
      encodeURIComponent(apiKey) +
      "&language=ja-JP";

    const data = await fetchJson(url);

    let movies =
      Array.isArray(data.parts)
        ? data.parts
        : [];

    movies = movies
      .filter(function(movie) {
        return movie && movie.id;
      })
      .sort(function(a, b) {
        return String(
          a.release_date ||
          "9999-99-99"
        ).localeCompare(
          String(
            b.release_date ||
            "9999-99-99"
          )
        );
      });

    return {
      name: data.name || "",

      movies:
        movies.map(function(movie) {
          return {
            id: movie.id,
            title: movie.title || "",
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


async function fetchJson(url) {
  const response = await fetch(
    url,
    {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    }
  );

  const text = await response.text();

  console.log(
    "TMDB STATUS:",
    response.status
  );

  let data;

  try {
    data = JSON.parse(text);

  } catch (error) {
    console.error(
      "TMDB RESPONSE:",
      text.substring(0, 1000)
    );

    throw new Error(
      "TMDBの応答をJSONとして解析できませんでした。HTTP STATUS: " +
      response.status
    );
  }

  if (!response.ok) {
    console.error(
      "TMDB API ERROR:",
      data
    );

    throw new Error(
      data &&
      data.status_message
        ? data.status_message
        : "TMDB API ERROR " +
          response.status
    );
  }

  return data;
}


function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(
      /[「」『』【】（）()・:：!?！？,.，。]/g,
      ""
    );
}
```
