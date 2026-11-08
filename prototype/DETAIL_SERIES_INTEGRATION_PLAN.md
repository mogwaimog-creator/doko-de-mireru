# 詳細API × 共通配信台帳：Codex実装引継ぎ（開発ブランチ限定）

## 現行コードの接続箇所
- `api/search.js` の `if (id)` 内：TV詳細は `getTvDetail(id, apiKey)`、映画詳細は `getMovieDetail(id, apiKey)` を呼び、その結果を `res.status(200).json(result)` で返す。
- `detail.html`：`loadMovie()` が既存の `/api/search?id=...&type=...` を一度取得し、`renderMovie(movie)` を呼ぶ。
- `renderMovie(movie)` から `renderSeries(movie.series, movie.seriesStreamingByWork)` に渡す（開発ブランチで追加済み）。
- `renderSeries` は `seriesStreamingByWork['movie:ID'|'tv:ID']` が配列ならカードへ直接表示、未提供なら従来の個別APIへフォールバックする。
- `prototype/detail-series-payload.js` の `attachSeriesStreaming(detail, ledger)` は **メモリ内のデモ台帳** を参照する読み取り専用の試作品。現行Redis形式との互換性は未確認。

## Codex実装方針（まだ本番接続しない）
1. まず `api/_detail-providers-cache.js`、`api/_redis.js` 等を読んで、**本番配信キャッシュのキー・形式・有効期限・エラー時挙動**を確認する。試作 `store()` を本番Redisの実装と同一視しない。
2. 本番キャッシュの既存データを **読み取り専用** で使うアダプターを作る。新規TMDB取得・新規Redis書き込み・キャッシュキー変更は行わない。
3. 作品詳細の二つの返却経路（movie / tv）に対し、**オプトインのフラグ**が有効な場合だけ `seriesStreamingByWork` を追加する。シーズン取得、人物検索、通常検索には適用しない。
4. `seriesStreamingByWork` は `{ 'movie:123': [{provider_id,provider_name,logo_path}], 'tv:456': [] }` の形式。未取得・失敗はキーを省略し、取得済み空配列のみ「見放題なし」とする。
5. カードごとの既存取得は、情報欠落時のフォールバックとして残す。**カードの表示・リンク・ポスターは変更しない**。
6. API呼び出し削減の計測は、同じ関連作品リストに対する `/api/search` リクエスト数を、共通台帳ヒット・ミス別に比較する。既存の3つの `fetch()` 呼び出し箇所の数だけでは通信回数を証明できない。
7. 映画とTVの同一数値ID、未登録、登録済み空配信、取得失敗、関連作品重複、古い配信データ、シリーズが空のケースをテストする。
8. Node.js `node --test` とブラウザ確認を実行する。開発ブランチ・プレビュー環境のみで確認し、本番環境変数・本番Redis・本番サイトには触れない。

## 安全条件
- 本番反映、Redisの削除・移行・書き込み、Vercelの課金設定変更、追加有料リソース作成は **事前承認が必要**。
- 既存の6時・18時の配信更新方式を変更しない。
- 追加APIルートを増やさず、既存の作品詳細JSONを拡張する。
- 失敗時はフラグを無効化して従来動作に戻せること。
- 現在のデモテストはブラウザの実測でもNode.js標準テスト実行でもないため、実装完了の根拠にしない。
