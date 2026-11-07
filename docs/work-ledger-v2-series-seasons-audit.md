# 作品詳細のシーズン・関連シリーズ表示監査（2026-11-07）

対象: `detail.html` の `renderSeasons` / `renderSeries` と `api/_work-v2-detail-adapter.js`。読み取り専用監査。

## シーズン表示
- `renderSeasons` は `season.season_number`、`season.name`、`season.episode_count` を使用。
- クリックすると `loadSeason(movieId, season.season_number, mediaType)` を呼ぶ。
- v2 アダプターは上記3項目を出力する。シーズンポスターはこの一覧では参照されない。
- **未検証**: `loadSeason` の取得API、エピソード表示、キャッシュの連携。表示互換性が全面的に保証されたわけではない。

## 関連シリーズ表示
- `renderSeries` は映画の場合 `series.movies`、TVの場合は配列 `series` を受け取る。
- 各作品の `id`、`title`、`content_type` / `media_type` を使用して詳細リンクを組み立てる。
- 現行 v2 アダプターは `series` を生成しないため、**現時点では互換性未達**。
- コレクションを削除しても表示を維持するには、関連シリーズ情報をページ固有の手動領域から供給するか、独立した共有データを参照するかを設計・検証する必要がある。TMDB への訪問者ごとの再検索は採用しない。

## 移行ブロッカー
1. 関連シリーズのデータ供給元を決めて互換性を実装する。
2. シーズン詳細取得経路とエピソード表示を検証する。
3. 映画・TV の実データを使い、表示比較と自動化テストを実行する。

本番の Redis キー・API・ページは未変更。