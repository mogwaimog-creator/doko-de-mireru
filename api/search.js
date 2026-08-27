// =========================================================
// 映画検索
// =========================================================

async function searchMovies(
  query,
  apiKey,
  res
) {

  const searchUrl =
    "https://api.themoviedb.org/3/search/movie" +
    "?api_key=" +
    encodeURIComponent(apiKey) +
    "&language=ja-JP" +
    "&region=JP" +
    "&query=" +
    encodeURIComponent(query) +
    "&include_adult=false";


  const response =
    await fetch(searchUrl);


  if (!response.ok) {

    const text =
      await response.text();

    console.error(
      "TMDB search error:",
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
  // 検索文字列を正規化
  // =====================================================

  const normalizeText =
    function(text) {

      return String(text || "")
        .toLowerCase()
        .replace(
          /[\s　・\-ー−―:：,.，。！？!?'"「」『』（）()【】\[\]]/g,
          ""
        );

    };


  const searchText =
    normalizeText(query);


  // =====================================================
  // 一致度を計算
  //
  // 数字が大きいほど検索タイトルとの一致度が高い
  // =====================================================

  const calculateScore =
    function(movie) {

      const title =
        normalizeText(
          movie.title
        );

      const originalTitle =
        normalizeText(
          movie.original_title
        );


      if(!title && !originalTitle){

        return 0;

      }


      // 完全一致
      if(
        title === searchText ||
        originalTitle === searchText
      ){

        return 1000;

      }


      // タイトルが検索文字列を完全に含む
      if(
        title.includes(searchText)
      ){

        return 900;

      }


      // 検索文字列がタイトルに含まれる
      if(
        searchText.includes(title) &&
        title.length > 0
      ){

        return 850;

      }


      // 原題に検索文字列を含む
      if(
        originalTitle.includes(searchText)
      ){

        return 800;

      }


      // 検索文字列を文字単位で比較
      let matched = 0;


      for(
        let i = 0;
        i < searchText.length;
        i++
      ){

        const char =
          searchText[i];


        if(
          title.includes(char)
        ){

          matched++;

        }

      }


      const characterScore =
        searchText.length > 0
          ? (
              matched /
              searchText.length
            ) * 500
          : 0;


      return characterScore;

    };


  // =====================================================
  // 一致度を付ける
  // =====================================================

  const scoredMovies =
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
            movie.vote_average || 0,

          _matchScore:
            calculateScore(movie)

        };

      });


  // =====================================================
  // 並び替え
  //
  // ① 検索タイトルとの一致度が高い順
  // ② 一致度が同じなら公開日の早い順
  // =====================================================

  scoredMovies.sort(
    function(a, b) {

      // ① 一致度
      if(
        b._matchScore !==
        a._matchScore
      ){

        return (
          b._matchScore -
          a._matchScore
        );

      }


      // ② 公開日の早い順
      const dateA =
        a.release_date ||
        "9999-99-99";

      const dateB =
        b.release_date ||
        "9999-99-99";


      if(dateA !== dateB){

        return dateA.localeCompare(
          dateB
        );

      }


      // ③ 最後にタイトル順
      return String(
        a.title
      ).localeCompare(
        String(b.title),
        "ja"
      );

    }
  );


  // =====================================================
  // 上位10作品
  //
  // 内部用の _matchScore は返さない
  // =====================================================

  const movies =
    scoredMovies
      .slice(0, 10)
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

          poster_path:
            movie.poster_path,

          overview:
            movie.overview,

          vote_average:
            movie.vote_average

        };

      });


  return res.status(200).json({

    results:
      movies

  });

}
