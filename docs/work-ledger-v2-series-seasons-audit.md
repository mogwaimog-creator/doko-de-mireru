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

## 既存 API 経路の追加調査
- `detail.html` は `API_URL="/api/search"` に `?id=...&type=tv&season=...` を付けてリクエストし、`renderEpisodes(data)` へ渡す。
- `api/search.js` の `getTvSeason` は TMDB `/tv/{id}/season/{number}` を取得するだけでなく、毎回 `/tv/{id}?append_to_response=watch/providers` も取得している。エピソード一覧表示では `streaming/rental/purchase` を参照しない。
- `renderEpisodes` の使用フィールドは `data.season_name`、`data.season_number`、`data.episodes[].episode_number/name/air_date/runtime/overview`。既存の `still_path` は使っていない。
- 作成済み `api/_season-ledger-response.js` は必要な応答形式だけを生成する純粋関数であり、Redis にはまだ接続していない。
- **推奨実装順**: (1) 既存 API のシーズン分岐の入口・バリデーション確認 (2) 台帳キャッシュ読み込み (3) 未保存時のみ TMDB シーズン1回取得 (4) 正常時に台帳保存 (5) 応答を変換して返す (6) エラー時は既存データを保持。訪問者ごとの作品本体/配信再取得は不要。
- 作品・配信台帳の更新ルール（シリーズは朝6時、一般作品は24時間経過後の次アクセス）をシーズン閲覧が変更してはならない。
- **未実施**: 実データ照合、シーズン分岐の書き換え、Redis 接続、負荷テスト、追加テスト実行。
