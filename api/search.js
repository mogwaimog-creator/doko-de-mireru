mogwaimog-creator
doko-de-mireru
Repository navigation
Code
Issues
Pull requests
Actions
Projects
Wiki
Security and quality
Insights
Settings
Commit 917b9db
mogwaimog-creator
mogwaimog-creator
authored
2 時間前
·
·
Verified
Update search.js
main
1 parent 
f0b33dd
 commit 
917b9db
1 file changed

+82
-9
Lines changed: 82 additions & 9 deletions
File tree
Filter files…
api
search.js
Search within code
 
‎api/search.js‎
+82
-9
Lines changed: 82 additions & 9 deletions
Original file line number	Diff line number	Diff line change
@@ -17,11 +17,11 @@ export default async function handler(req, res) {
    }

    const searchUrl =
      `https://api.themoviedb.org/3/search/movie` +
      `?api_key=${apiKey}` +
      `&language=ja-JP` +
      `&query=${encodeURIComponent(query)}` +
      `&region=JP`;
      "https://api.themoviedb.org/3/search/movie" +
      "?api_key=" + apiKey +
      "&language=ja-JP" +
      "&query=" + encodeURIComponent(query) +
      "&region=JP";

    const searchResponse = await fetch(searchUrl);
    const searchData = await searchResponse.json();
@@ -35,35 +35,108 @@ export default async function handler(req, res) {
    const movie = searchData.results[0];

    const providersUrl =
      `https://api.themoviedb.org/3/movie/${movie.id}/watch/providers` +
      `?api_key=${apiKey}`;
      "https://api.themoviedb.org/3/movie/" +
      movie.id +
      "/watch/providers" +
      "?api_key=" + apiKey;

    const providersResponse = await fetch(providersUrl);
    const providersData = await providersResponse.json();

    const japan =
      providersData.results && providersData.results.JP
      providersData.results &&
      providersData.results.JP
        ? providersData.results.JP
        : {};

    const detailUrl =
      "https://api.themoviedb.org/3/movie/" +
      movie.id +
      "?api_key=" + apiKey +
      "&language=ja-JP";
    const detailResponse = await fetch(detailUrl);
    const detailData = await detailResponse.json();
    let collection = null;
    let seriesMovies = [];
    if (detailData.belongs_to_collection) {
      collection = detailData.belongs_to_collection;
      const collectionUrl =
        "https://api.themoviedb.org/3/collection/" +
        collection.id +
        "?api_key=" + apiKey +
        "&language=ja-JP";
      const collectionResponse = await fetch(collectionUrl);
      const collectionData = await collectionResponse.json();
      if (
        collectionData.parts &&
        collectionData.parts.length
      ) {
        seriesMovies = collectionData.parts
          .sort(function(a, b) {
            const dateA =
              a.release_date || "9999-99-99";
            const dateB =
              b.release_date || "9999-99-99";
            return dateA.localeCompare(dateB);
          })
          .map(function(item) {
            return {
              id: item.id,
              title: item.title,
              release_date: item.release_date,
              poster_path: item.poster_path
            };
          });
      }
    }
    return res.status(200).json({
      id: movie.id,
      title: movie.title,
      original_title: movie.original_title,
      release_date: movie.release_date,
      overview: movie.overview,
      poster_path: movie.poster_path,
      streaming: japan.flatrate || [],
      rental: japan.rent || [],
      purchase: japan.buy || [],
      link: japan.link || null
      link: japan.link || null,
      series: collection
        ? {
            id: collection.id,
            name: collection.name,
            movies: seriesMovies
          }
        : null
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "検索中にエラーが発生しました"
    });
  }
}
0 commit comments
Comments
0
 (0)
Comment
You're not receiving notifications from this thread.
